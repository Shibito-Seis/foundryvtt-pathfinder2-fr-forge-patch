/**
 * Compatibility shim for PF2-FR 7.11.1 with Babele 2.9.x.
 *
 * PF2-FR 7.11.1 used to import:
 * ../babele/script/compendium-mapping.js
 *
 * That file no longer exists in Babele 2.9.x.
 * This shim exposes the old CompendiumMapping API expected by PF2-FR,
 * while delegating the real mapping work to Babele's current documentMappings API.
 */

export class CompendiumMapping {
  constructor(entityType, mapping) {
    this.entityType = entityType;
    this.customMapping = mapping ?? {};
  }

  _mappingFor(data = {}) {
    const babele = game.babele;

    if (!babele?.documentMappings) {
      console.warn("pf2-fr | Babele documentMappings API is not available yet.");
      return null;
    }

    try {
      return babele.documentMappings.mappingFor(this.entityType, this.customMapping);
    } catch (error) {
      console.error("pf2-fr | Failed to build Babele document mapping.", {
        entityType: this.entityType,
        customMapping: this.customMapping,
        data,
        error
      });

      return null;
    }
  }

  map(data, translations) {
    const mapping = this._mappingFor(data);

    if (!mapping) {
      return {};
    }

    try {
      return mapping.map(data, translations ?? {});
    } catch (error) {
      console.error("pf2-fr | Failed to map translated data.", {
        entityType: this.entityType,
        data,
        translations,
        error
      });

      return {};
    }
  }

  translateField(field, data, translations) {
    const mapping = this._mappingFor(data);

    if (!mapping) {
      return undefined;
    }

    try {
      return mapping.translateField(field, data, translations ?? {});
    } catch (error) {
      console.error("pf2-fr | Failed to translate field.", {
        entityType: this.entityType,
        field,
        data,
        translations,
        error
      });

      return undefined;
    }
  }

  extractField(field, data) {
    const mapping = this._mappingFor(data);

    if (!mapping) {
      return undefined;
    }

    try {
      return mapping.extractField(field, data);
    } catch (error) {
      console.error("pf2-fr | Failed to extract field.", {
        entityType: this.entityType,
        field,
        data,
        error
      });

      return undefined;
    }
  }

  extract(data) {
    const mapping = this._mappingFor(data);

    if (!mapping) {
      return {};
    }

    try {
      return mapping.extract(data);
    } catch (error) {
      console.error("pf2-fr | Failed to extract mapped data.", {
        entityType: this.entityType,
        data,
        error
      });

      return {};
    }
  }

  isDynamic() {
    return true;
  }
}