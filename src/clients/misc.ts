// Keyword + supermarket category + unit conversion clients.

import { BaseClient } from './base.js';

function qs(params?: Record<string, any>): string {
  const sp = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) sp.append(k, String(v));
    });
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

export class KeywordClient extends BaseClient {
  async listKeywords(params?: {
    query?: string;
    limit?: string;
    page?: number;
    page_size?: number;
    random?: string;
    root?: number;
    root_tree?: number;
    tree?: number;
    updated_at?: string;
  }): Promise<any> {
    return this.request(`/api/keyword/${qs(params)}`);
  }

  async getKeyword(id: number): Promise<any> { return this.request(`/api/keyword/${id}/`); }

  async createKeyword(body: any): Promise<any> {
    return this.request('/api/keyword/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchKeyword(id: number, body: any): Promise<any> {
    return this.request(`/api/keyword/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteKeyword(id: number): Promise<void> {
    return this.request(`/api/keyword/${id}/`, { method: 'DELETE' });
  }

  async mergeKeyword(id: number, target: number): Promise<any> {
    return this.request(`/api/keyword/${id}/merge/${target}/`, { method: 'PUT', body: '{}' });
  }

  async moveKeyword(id: number, parent: number): Promise<any> {
    return this.request(`/api/keyword/${id}/move/${parent}/`, { method: 'PUT', body: '{}' });
  }
}

export class SupermarketCategoryClient extends BaseClient {
  async listCategories(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/supermarket-category/${qs(params)}`);
  }

  async getCategory(id: number): Promise<any> { return this.request(`/api/supermarket-category/${id}/`); }

  async createCategory(body: any): Promise<any> {
    return this.request('/api/supermarket-category/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchCategory(id: number, body: any): Promise<any> {
    return this.request(`/api/supermarket-category/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteCategory(id: number): Promise<void> {
    return this.request(`/api/supermarket-category/${id}/`, { method: 'DELETE' });
  }

  async mergeCategory(id: number, target: number): Promise<any> {
    return this.request(`/api/supermarket-category/${id}/merge/${target}/`, { method: 'PUT', body: '{}' });
  }
}

export class PropertyClient extends BaseClient {
  async listProperties(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/property/${qs(params)}`);
  }
  async getProperty(id: number): Promise<any> { return this.request(`/api/property/${id}/`); }
  async createProperty(body: any): Promise<any> {
    return this.request('/api/property/', { method: 'POST', body: JSON.stringify(body) });
  }
  async patchProperty(id: number, body: any): Promise<any> {
    return this.request(`/api/property/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deleteProperty(id: number): Promise<void> {
    return this.request(`/api/property/${id}/`, { method: 'DELETE' });
  }
}

export class PropertyTypeClient extends BaseClient {
  async listPropertyTypes(params?: {
    page?: number;
    page_size?: number;
    category?: Array<'ALLERGEN' | 'GOAL' | 'NUTRITION' | 'OTHER' | 'PRICE'>;
  }): Promise<any> {
    const sp = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined) {
          if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
          else sp.append(k, String(v));
        }
      });
    }
    const s = sp.toString();
    return this.request(`/api/property-type/${s ? `?${s}` : ''}`);
  }
  async getPropertyType(id: number): Promise<any> { return this.request(`/api/property-type/${id}/`); }
  async createPropertyType(body: any): Promise<any> {
    return this.request('/api/property-type/', { method: 'POST', body: JSON.stringify(body) });
  }
  async patchPropertyType(id: number, body: any): Promise<any> {
    return this.request(`/api/property-type/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deletePropertyType(id: number): Promise<void> {
    return this.request(`/api/property-type/${id}/`, { method: 'DELETE' });
  }
}

export class CustomFilterClient extends BaseClient {
  async listFilters(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/custom-filter/${qs(params)}`);
  }
  async getFilter(id: number): Promise<any> { return this.request(`/api/custom-filter/${id}/`); }
  async createFilter(body: any): Promise<any> {
    return this.request('/api/custom-filter/', { method: 'POST', body: JSON.stringify(body) });
  }
  async patchFilter(id: number, body: any): Promise<any> {
    return this.request(`/api/custom-filter/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deleteFilter(id: number): Promise<void> {
    return this.request(`/api/custom-filter/${id}/`, { method: 'DELETE' });
  }
}

export class SupermarketCategoryRelationClient extends BaseClient {
  async listRelations(params?: { page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/supermarket-category-relation/${qs(params)}`);
  }
  async getRelation(id: number): Promise<any> { return this.request(`/api/supermarket-category-relation/${id}/`); }
  async createRelation(body: any): Promise<any> {
    return this.request('/api/supermarket-category-relation/', { method: 'POST', body: JSON.stringify(body) });
  }
  async patchRelation(id: number, body: any): Promise<any> {
    return this.request(`/api/supermarket-category-relation/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }
  async deleteRelation(id: number): Promise<void> {
    return this.request(`/api/supermarket-category-relation/${id}/`, { method: 'DELETE' });
  }
}

export class UnitConversionClient extends BaseClient {
  async listConversions(params?: { food_id?: number; query?: string; page?: number; page_size?: number }): Promise<any> {
    return this.request(`/api/unit-conversion/${qs(params)}`);
  }

  async getConversion(id: number): Promise<any> { return this.request(`/api/unit-conversion/${id}/`); }

  async createConversion(body: any): Promise<any> {
    return this.request('/api/unit-conversion/', { method: 'POST', body: JSON.stringify(body) });
  }

  async patchConversion(id: number, body: any): Promise<any> {
    return this.request(`/api/unit-conversion/${id}/`, { method: 'PATCH', body: JSON.stringify(body) });
  }

  async deleteConversion(id: number): Promise<void> {
    return this.request(`/api/unit-conversion/${id}/`, { method: 'DELETE' });
  }
}
