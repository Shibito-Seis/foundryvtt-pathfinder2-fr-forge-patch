import {CompendiumMapping} from "./scripts/compendium-mapping-compat.js";

class Translator {
    static get() {
        if (!Translator.instance) {
            Translator.instance = new Translator();
        }
        return Translator.instance;
    }

    // Initialize translator
    async initialize() {
        // Signalize translator is ready
        Hooks.callAll("pf2FR.ready");

        const config = await Promise.all([
            fetch("modules/pf2-fr/config.json")
                .then((r) => r.json())
                .catch((_e) => {
                    console.error("pf2-fr: Couldn't find translator config file.");
                }),
        ]);

        this.mappings = config[0]?.mappings ?? {};
    }

    constructor() {
        this.initialize();
    }

    sluggify(label) {
        return label
            .replace(/([a-z])([A-Z])\B/g, "$1-$2")
            .toLowerCase()
            .replace(/['’]/g, "")
            .replace(/[^a-z0-9]+/gi, " ")
            .trim()
            .replace(/[-\s]+/g, "-");
    }

    getMapping(mapping, compendium = false) {
        if (compendium) {
            return this.mappings[mapping]
                ? new CompendiumMapping(this.mappings[mapping].entryType, this.mappings[mapping].mappingEntries)
                : {};
        }
        return this.mappings[mapping];
    }

    dynamicMerge(sourceObject, translation, mapping) {
        if (translation) {
            foundry.utils.mergeObject(sourceObject, mapping.map(sourceObject, translation ?? {}), { overwrite: true });
        }
        return sourceObject;
    }

    dynamicObjectListMerge(sourceObjectList, translations, mapping) {
        if (translations) {
            const mergedObjectList = {};
            Object.keys(sourceObjectList).forEach((entry) => {
                Object.assign(mergedObjectList, {
                    [entry]: this.dynamicMerge(sourceObjectList[entry], translations[entry], mapping),
                });
            });
        }
    }

    dynamicArrayMerge(sourceArray, translation, mapping) {
        if(!translation) {
            return sourceArray;
        }
        // Loop through array, merge available objects
        const mappedObjectArray = [];
        for (let i = 0; i < sourceArray.length; i++) {
            if (translation[i]) {
                mappedObjectArray.push(this.dynamicMerge(sourceArray[i], translation[i], mapping));
            } else {
                mappedObjectArray.push(sourceArray[i]);
            }
        }
        return mappedObjectArray;
    }

    translateActorItems(data, translation) {
        data.forEach((entry, index, arr) => {
            let specificTranslation = translation ? translation[entry["_id"]] : undefined;
            const originalName = entry.name;
            if (entry._stats?.compendiumSource
                && entry._stats.compendiumSource.startsWith("Compendium")
                && !entry._stats.compendiumSource.includes(".Actor.")
                && entry._stats.compendiumSource !== "Compendium.pf2e.spells-srd.Item.o0l57UfBm9ScEUMW"
                && entry._stats.compendiumSource !== "Compendium.pf2e.spells-srd.Item.6dDtGIUerazSHIOu") {
                const itemCompendium = entry._stats.compendiumSource.slice(
                    entry._stats.compendiumSource.indexOf(".") + 1,
                    entry._stats.compendiumSource.lastIndexOf(".Item.")
                );
                const originalName = fromUuidSync(entry._stats.compendiumSource, {'strict': false})?.flags?.babele?.originalName;
                if (originalName) {
                    entry.name = originalName;
                    
                    if (game.babele?.translate) {
                        arr[index] = game.babele.translate(itemCompendium, entry);
                    }
                }
            }

            if (specificTranslation) {
                // Merge specific translation into Compendium translation
                this.dynamicMerge(arr[index], specificTranslation, this.getMapping("item", true))
                // Add Babele standard translated fields
                foundry.utils.mergeObject(arr[index], {
                    translated: true,
                    hasTranslation: true,
                    originalName: originalName,
                    flags: {
                        babele: {
                            translated: true,
                            hasTranslation: true,
                            originalName: originalName
                        }
                    }
                });
            }

            // Add the item slug if not already included
            if (!arr[index].system.slug || arr[index].system.slug === "") {
                arr[index].system.slug = this.sluggify(originalName);
            }
        });

        return data;
    }

    translateEquipmentName(data, translation, dataObject) {
        if (["weapon", "armor"].includes(dataObject?.type) && dataObject?.system?.category !== "shield"
            && game.settings.get('pf2-fr', 'item-name-generation') && translation) {
            if (game.settings.get('pf2-fr', 'name-display') === "vf-vo") {
                return translation.replace(" (" + data + ")", "");
            }
            else if (game.settings.get('pf2-fr', 'name-display') === "vo-vf") {
                return translation.replace(data + " (", "").slice(0, -1);
            }
            else {
                return translation;
            }
        }
        else {
            return translation;
        }
    }
}

function patchSpellRange() {
    libWrapper?.register(
        "pf2-fr",
        "CONFIG.PF2E.Item.documentClasses.spell.prototype.isMelee",
        function (wrapped) {
            return game.pf2e.system.sluggify(this.system.range.value) === "contact" || wrapped();
        },
        "MIXED"
    );

    libWrapper?.register(
        "pf2-fr",
        "CONFIG.PF2E.Item.documentClasses.spell.prototype.isRanged",
        function (wrapped) {
            const res = wrapped();
            if (res) return res;
            const slug = game.pf2e.system.sluggify(this.system.range.value);
            const rangeFeet = Math.floor(Math.abs(Number(/^(\d+)-(ft|feet)(?!\w)/.exec(slug)?.at(1))));
            if (Number.isInteger(rangeFeet)) return { increment: null, max: rangeFeet }
            const rangeMeters = Math.floor(Math.abs(Number(/^(\d+(?:\.\d+)?)-(mètres|mètre|meters|meter)(?!\w)/.exec(slug)?.at(1)))*10/3);
            if (Number.isFinite(rangeMeters)) return { increment: null, max: rangeMeters }
            else return null;
        },
        "MIXED"
    );
}

/**
 * Credits to n1xx1 for suggesting this compatibility script for translated items
 */
function hookOnAutoAnimations() {
    if (!game.modules.has("autoanimations") || game.settings.get('pf2-fr', 'deactivate-animations-mapping')) {
        return;
    }

    Hooks.on("AutomatedAnimations-WorkflowStart", (data, animationData) => {
        if (animationData && animationData.isCustomized) return;

        if (data.item?.type === "condition" && data.item?.rollOptionSlug) {
            data.recheckAnimation = true;
            data.item = AACreateItemNameProxy(data.item, data.item?.rollOptionSlug);
        }

        if (data.item?.flags?.babele?.originalName) {
            data.recheckAnimation = true;
            data.item = AACreateItemNameProxy(data.item, data.item.flags.babele.originalName);
        }

        if (data.ammoItem?.flags?.babele?.originalName) {
            data.recheckAnimation = true;
            data.ammoItem = AACreateItemNameProxy(data.ammoItem, data.ammoItem.flags.babele.originalName);
        }

        if (data.originalItem?.flags?.babele?.originalName) {
            data.recheckAnimation = true;
            data.originalItem = AACreateItemNameProxy(data.originalItem, data.originalItem.flags.babele.originalName);
        }
    });
}

function AACreateItemNameProxy(item, realName) {
    return new Proxy(item, {
        get(target, p, receiver) {
            return ("name" === p) ? realName : Reflect.get(target, p, receiver);
        },
    });
}

Hooks.once("init", () => {
    game.langFRPf2e = Translator.get();

    game.settings.register("pf2-fr", "name-display", {
        name: "Affichage des noms",
        hint: "Vous pouvez choisir ici la manière dont les noms des acteurs, objets et journaux issus des compendiums seront traduits et affichés",
        scope: "world",
        type: String,
        choices: {
            "vf-vo": "VF (VO)",
            "vo-vf": "VO (VF)",
            "vf": "VF",
            "vo": "VO"
        },
        default: "vf-vo",
        config: true,
        onChange: foundry.utils.debouncedReload
    });

    game.settings.register("pf2-fr", "item-name-generation", {
        name: "Armes et armures seulement en VF",
        hint: "Le système modifie automatiquement les noms des armes et des armures en fonction de leurs propriétés (matériaux et runes). Pour cela les noms des armes et des armures doivent être en VF uniquement. Incompatible avec les noms en VO pure.",
        scope: "world",
        type: Boolean,
        default: false,
        config: true,
        onChange: foundry.utils.debouncedReload
    });

    game.settings.register("pf2-fr", "deactivate-animations-mapping", {
        name: "Mappings PF2E Animations manuels",
        hint: "Le module PF2E Animations permet une animation automatiques lors d'utilisations de sorts et d'armes issues des compendiums généraux. La traduction automatise cette détection y compris à l'utilisation d'objets traduits automatiquement. Si vous utilisez des mappings customs dans le menu d'animations, vous pouvez désactiver ce mapping de traduction en cochant cette case.",
        scope: "world",
        type: Boolean,
        default: false,
        config: true,
        onChange: foundry.utils.debouncedReload
    });

    if (typeof game.babele !== "undefined") {
        game.babele.register({
            module: "pf2-fr",
            lang: 'fr',
            dir: "babele/"+game.settings.get('pf2-fr', 'name-display')+"/fr/"
        });

        game.babele.registerConverters({
            "translateActorItems": (data, translation) => {
                return game.langFRPf2e.translateActorItems(data, translation);
            },
            "translateEquipmentName": (data, translation, dataObject) => {
                return game.langFRPf2e.translateEquipmentName(data, translation, dataObject);
            },
            "translateHeightening": (data, translation) => {
                return game.langFRPf2e.dynamicObjectListMerge(data, translation, game.langFRPf2e.getMapping("heightening", true));
            },
            "translateSpellVariant": (data, translation) => {
                return game.langFRPf2e.dynamicObjectListMerge(data, translation, game.langFRPf2e.getMapping("item", true));
            },
            "translateRules": (data, translation) => {
                return game.langFRPf2e.dynamicArrayMerge(data, translation, game.langFRPf2e.getMapping("rules", true));
            },
            "translateSkillVariants": (data, translation) => {
                return game.langFRPf2e.dynamicObjectListMerge(data, translation, game.langFRPf2e.getMapping("skillSpecial", true));
            }
        });
    }

    hookOnAutoAnimations();

    patchSpellRange();
});

Hooks.once("babele.ready", () => {
    game.pf2e.ConditionManager.initialize();
    ui.compendium.compileSearchIndex();

    if (game.modules.get("lang-fr-pf2e")?.active){
        ui.notifications.error("Le package \"Système PF2 Français\" est encore installé sur cette partie ; il n'est plus utile et peut donc être désinstallé.")
    }
});
