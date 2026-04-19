// Keyword, supermarket category, unit conversion, property, property-type,
// custom filter, supermarket-category-relation handlers.

import { TandoorClient } from '../clients/index.js';
import type {
  ListKeywordsArgs,
  GetKeywordArgs,
  CreateKeywordArgs,
  UpdateKeywordArgs,
  DeleteKeywordArgs,
  MergeKeywordArgs,
  MoveKeywordArgs,
  ListSupermarketCategoriesArgs,
  GetSupermarketCategoryArgs,
  CreateSupermarketCategoryArgs,
  UpdateSupermarketCategoryArgs,
  DeleteSupermarketCategoryArgs,
  MergeSupermarketCategoryArgs,
  ListUnitConversionsArgs,
  GetUnitConversionArgs,
  CreateUnitConversionArgs,
  UpdateUnitConversionArgs,
  DeleteUnitConversionArgs,
  ListPropertyTypesArgs,
  GetPropertyTypeArgs,
  CreatePropertyTypeArgs,
  UpdatePropertyTypeArgs,
  DeletePropertyTypeArgs,
  ListPropertiesArgs,
  GetPropertyArgs,
  CreatePropertyArgs,
  UpdatePropertyArgs,
  DeletePropertyArgs,
  ListCustomFiltersArgs,
  GetCustomFilterArgs,
  CreateCustomFilterArgs,
  UpdateCustomFilterArgs,
  DeleteCustomFilterArgs,
  ListSupermarketCategoryRelationsArgs,
  GetSupermarketCategoryRelationArgs,
  CreateSupermarketCategoryRelationArgs,
  UpdateSupermarketCategoryRelationArgs,
  DeleteSupermarketCategoryRelationArgs,
} from '../tools/misc.js';

const emit = (o: unknown) => JSON.stringify(o);

const slimKeyword = (k: any) => k && {
  id: k.id, name: k.name, label: k.label, description: k.description,
  parent: k.parent, numchild: k.numchild, full_name: k.full_name,
};
const slimCategory = (c: any) => c && { id: c.id, name: c.name, description: c.description };
const slimConversion = (u: any) => u && {
  id: u.id, name: u.name,
  base_amount: u.base_amount, base_unit: u.base_unit?.name, base_unit_id: u.base_unit?.id,
  converted_amount: u.converted_amount, converted_unit: u.converted_unit?.name, converted_unit_id: u.converted_unit?.id,
  food: u.food?.name, food_id: u.food?.id,
};

const slimPage = (p: any, slim: (x: any) => any) => p?.results
  ? { count: p.count, next: p.next, previous: p.previous, results: p.results.map(slim) }
  : p;

// ---------- Keywords ----------

export async function handleListKeywords(client: TandoorClient, args: ListKeywordsArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.keywords.listKeywords(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimKeyword));
}

export async function handleGetKeyword(client: TandoorClient, args: GetKeywordArgs): Promise<string> {
  const r = await client.keywords.getKeyword(args.id);
  return args.format === 'full' ? emit(r) : emit(slimKeyword(r));
}

export async function handleCreateKeyword(client: TandoorClient, args: CreateKeywordArgs): Promise<string> {
  const body: any = { name: args.name };
  if (args.description !== undefined) body.description = args.description;
  const r = await client.keywords.createKeyword(body);
  return `Keyword created.\n\n${emit(args.format === 'full' ? r : slimKeyword(r))}`;
}

export async function handleUpdateKeyword(client: TandoorClient, args: UpdateKeywordArgs): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.description !== undefined) body.description = args.description;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.keywords.patchKeyword(args.id, body);
  return `Keyword updated.\n\n${emit(args.format === 'full' ? r : slimKeyword(r))}`;
}

export async function handleDeleteKeyword(client: TandoorClient, args: DeleteKeywordArgs): Promise<string> {
  await client.keywords.deleteKeyword(args.id);
  return `Keyword ${args.id} deleted.`;
}

export async function handleMergeKeyword(client: TandoorClient, args: MergeKeywordArgs): Promise<string> {
  const r = await client.keywords.mergeKeyword(args.id, args.target);
  return `Keyword ${args.id} merged into ${args.target}.\n\n${emit(slimKeyword(r))}`;
}

export async function handleMoveKeyword(client: TandoorClient, args: MoveKeywordArgs): Promise<string> {
  const r = await client.keywords.moveKeyword(args.id, args.parent);
  return `Keyword ${args.id} moved under ${args.parent}.\n\n${emit(slimKeyword(r))}`;
}

// ---------- Supermarket categories ----------

export async function handleListSupermarketCategories(client: TandoorClient, args: ListSupermarketCategoriesArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.supermarketCategories.listCategories(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimCategory));
}

export async function handleGetSupermarketCategory(client: TandoorClient, args: GetSupermarketCategoryArgs): Promise<string> {
  const r = await client.supermarketCategories.getCategory(args.id);
  return args.format === 'full' ? emit(r) : emit(slimCategory(r));
}

export async function handleCreateSupermarketCategory(client: TandoorClient, args: CreateSupermarketCategoryArgs): Promise<string> {
  const body: any = { name: args.name };
  if (args.description !== undefined) body.description = args.description;
  const r = await client.supermarketCategories.createCategory(body);
  return `Supermarket category created.\n\n${emit(args.format === 'full' ? r : slimCategory(r))}`;
}

export async function handleUpdateSupermarketCategory(client: TandoorClient, args: UpdateSupermarketCategoryArgs): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.description !== undefined) body.description = args.description;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.supermarketCategories.patchCategory(args.id, body);
  return `Supermarket category updated.\n\n${emit(args.format === 'full' ? r : slimCategory(r))}`;
}

export async function handleDeleteSupermarketCategory(client: TandoorClient, args: DeleteSupermarketCategoryArgs): Promise<string> {
  await client.supermarketCategories.deleteCategory(args.id);
  return `Supermarket category ${args.id} deleted.`;
}

export async function handleMergeSupermarketCategory(client: TandoorClient, args: MergeSupermarketCategoryArgs): Promise<string> {
  const r = await client.supermarketCategories.mergeCategory(args.id, args.target);
  return `Supermarket category ${args.id} merged into ${args.target}.\n\n${emit(slimCategory(r))}`;
}

// ---------- Property types ----------

const slimPropertyType = (t: any) => t && {
  id: t.id, name: t.name, unit: t.unit, description: t.description,
  order: t.order, open_data_slug: t.open_data_slug, fdc_id: t.fdc_id,
};

const slimProperty = (p: any) => p && {
  id: p.id,
  property_amount: p.property_amount,
  property_type_id: p.property_type?.id,
  property_type_name: p.property_type?.name,
  property_type_unit: p.property_type?.unit,
};

export async function handleListPropertyTypes(client: TandoorClient, args: ListPropertyTypesArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.propertyTypes.listPropertyTypes(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimPropertyType));
}

export async function handleGetPropertyType(client: TandoorClient, args: GetPropertyTypeArgs): Promise<string> {
  const r = await client.propertyTypes.getPropertyType(args.id);
  return args.format === 'full' ? emit(r) : emit(slimPropertyType(r));
}

export async function handleCreatePropertyType(client: TandoorClient, args: CreatePropertyTypeArgs): Promise<string> {
  const body: any = { name: args.name };
  if (args.unit !== undefined) body.unit = args.unit;
  if (args.description !== undefined) body.description = args.description;
  if (args.order !== undefined) body.order = args.order;
  if (args.open_data_slug !== undefined) body.open_data_slug = args.open_data_slug;
  if (args.fdc_id !== undefined) body.fdc_id = args.fdc_id;
  const r = await client.propertyTypes.createPropertyType(body);
  return `Property type created.\n\n${emit(args.format === 'full' ? r : slimPropertyType(r))}`;
}

export async function handleUpdatePropertyType(client: TandoorClient, args: UpdatePropertyTypeArgs): Promise<string> {
  const body: any = {};
  for (const k of ['name', 'unit', 'description', 'order', 'open_data_slug', 'fdc_id'] as const) {
    if ((args as any)[k] !== undefined) body[k] = (args as any)[k];
  }
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.propertyTypes.patchPropertyType(args.id, body);
  return `Property type updated.\n\n${emit(args.format === 'full' ? r : slimPropertyType(r))}`;
}

export async function handleDeletePropertyType(client: TandoorClient, args: DeletePropertyTypeArgs): Promise<string> {
  await client.propertyTypes.deletePropertyType(args.id);
  return `Property type ${args.id} deleted.`;
}

// ---------- Properties ----------

export async function handleListProperties(client: TandoorClient, args: ListPropertiesArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.properties.listProperties(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimProperty));
}

export async function handleGetProperty(client: TandoorClient, args: GetPropertyArgs): Promise<string> {
  const r = await client.properties.getProperty(args.id);
  return args.format === 'full' ? emit(r) : emit(slimProperty(r));
}

export async function handleCreateProperty(client: TandoorClient, args: CreatePropertyArgs): Promise<string> {
  const body: any = {
    property_amount: args.property_amount,
    property_type: { id: args.property_type_id },
  };
  const r = await client.properties.createProperty(body);
  return `Property created.\n\n${emit(args.format === 'full' ? r : slimProperty(r))}`;
}

export async function handleUpdateProperty(client: TandoorClient, args: UpdatePropertyArgs): Promise<string> {
  const body: any = {};
  if (args.property_amount !== undefined) body.property_amount = args.property_amount;
  if (args.property_type_id !== undefined) body.property_type = { id: args.property_type_id };
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.properties.patchProperty(args.id, body);
  return `Property updated.\n\n${emit(args.format === 'full' ? r : slimProperty(r))}`;
}

export async function handleDeleteProperty(client: TandoorClient, args: DeletePropertyArgs): Promise<string> {
  await client.properties.deleteProperty(args.id);
  return `Property ${args.id} deleted.`;
}

// ---------- Custom filters ----------

const slimFilter = (f: any) => f && {
  id: f.id, name: f.name, search: f.search,
  shared_user_ids: Array.isArray(f.shared) ? f.shared.map((u: any) => u.id) : [],
};

export async function handleListCustomFilters(client: TandoorClient, args: ListCustomFiltersArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.customFilters.listFilters(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimFilter));
}

export async function handleGetCustomFilter(client: TandoorClient, args: GetCustomFilterArgs): Promise<string> {
  const r = await client.customFilters.getFilter(args.id);
  return args.format === 'full' ? emit(r) : emit(slimFilter(r));
}

export async function handleCreateCustomFilter(client: TandoorClient, args: CreateCustomFilterArgs): Promise<string> {
  const body: any = { name: args.name, search: args.search, shared: [] };
  if (Array.isArray(args.shared_user_ids)) body.shared = args.shared_user_ids.map((id) => ({ id }));
  const r = await client.customFilters.createFilter(body);
  return `Custom filter created.\n\n${emit(args.format === 'full' ? r : slimFilter(r))}`;
}

export async function handleUpdateCustomFilter(client: TandoorClient, args: UpdateCustomFilterArgs): Promise<string> {
  const body: any = {};
  if (args.name !== undefined) body.name = args.name;
  if (args.search !== undefined) body.search = args.search;
  if (Array.isArray(args.shared_user_ids)) body.shared = args.shared_user_ids.map((id) => ({ id }));
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.customFilters.patchFilter(args.id, body);
  return `Custom filter updated.\n\n${emit(args.format === 'full' ? r : slimFilter(r))}`;
}

export async function handleDeleteCustomFilter(client: TandoorClient, args: DeleteCustomFilterArgs): Promise<string> {
  await client.customFilters.deleteFilter(args.id);
  return `Custom filter ${args.id} deleted.`;
}

// ---------- Supermarket category relation ----------

const slimRelation = (r: any) => r && {
  id: r.id, order: r.order, supermarket: r.supermarket,
  category_id: r.category?.id, category_name: r.category?.name,
};

export async function handleListSupermarketCategoryRelations(client: TandoorClient, args: ListSupermarketCategoryRelationsArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.supermarketCategoryRelations.listRelations(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimRelation));
}

export async function handleGetSupermarketCategoryRelation(client: TandoorClient, args: GetSupermarketCategoryRelationArgs): Promise<string> {
  const r = await client.supermarketCategoryRelations.getRelation(args.id);
  return args.format === 'full' ? emit(r) : emit(slimRelation(r));
}

export async function handleCreateSupermarketCategoryRelation(client: TandoorClient, args: CreateSupermarketCategoryRelationArgs): Promise<string> {
  const body: any = {
    category: { id: args.category_id },
    supermarket: args.supermarket,
  };
  if (args.order !== undefined) body.order = args.order;
  const r = await client.supermarketCategoryRelations.createRelation(body);
  return `Supermarket category relation created.\n\n${emit(args.format === 'full' ? r : slimRelation(r))}`;
}

export async function handleUpdateSupermarketCategoryRelation(client: TandoorClient, args: UpdateSupermarketCategoryRelationArgs): Promise<string> {
  const body: any = {};
  if (args.category_id !== undefined) body.category = { id: args.category_id };
  if (args.supermarket !== undefined) body.supermarket = args.supermarket;
  if (args.order !== undefined) body.order = args.order;
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.supermarketCategoryRelations.patchRelation(args.id, body);
  return `Supermarket category relation updated.\n\n${emit(args.format === 'full' ? r : slimRelation(r))}`;
}

export async function handleDeleteSupermarketCategoryRelation(client: TandoorClient, args: DeleteSupermarketCategoryRelationArgs): Promise<string> {
  await client.supermarketCategoryRelations.deleteRelation(args.id);
  return `Supermarket category relation ${args.id} deleted.`;
}

// ---------- Unit conversions ----------

export async function handleListUnitConversions(client: TandoorClient, args: ListUnitConversionsArgs): Promise<string> {
  const { format, ...params } = args;
  const r = await client.unitConversions.listConversions(params);
  return format === 'full' ? emit(r) : emit(slimPage(r, slimConversion));
}

export async function handleGetUnitConversion(client: TandoorClient, args: GetUnitConversionArgs): Promise<string> {
  const r = await client.unitConversions.getConversion(args.id);
  return args.format === 'full' ? emit(r) : emit(slimConversion(r));
}

export async function handleCreateUnitConversion(client: TandoorClient, args: CreateUnitConversionArgs): Promise<string> {
  const body: any = {
    base_amount: args.base_amount,
    converted_amount: args.converted_amount,
    base_unit: { id: args.base_unit_id },
    converted_unit: { id: args.converted_unit_id },
  };
  if (args.food_id !== undefined) body.food = args.food_id == null ? null : { id: args.food_id };
  const r = await client.unitConversions.createConversion(body);
  return `Unit conversion created.\n\n${emit(args.format === 'full' ? r : slimConversion(r))}`;
}

export async function handleUpdateUnitConversion(client: TandoorClient, args: UpdateUnitConversionArgs): Promise<string> {
  const body: any = {};
  if (args.base_amount !== undefined) body.base_amount = args.base_amount;
  if (args.converted_amount !== undefined) body.converted_amount = args.converted_amount;
  if (args.base_unit_id !== undefined) body.base_unit = { id: args.base_unit_id };
  if (args.converted_unit_id !== undefined) body.converted_unit = { id: args.converted_unit_id };
  if (args.food_id !== undefined) body.food = args.food_id == null ? null : { id: args.food_id };
  if (Object.keys(body).length === 0) throw new Error('At least one field required');
  const r = await client.unitConversions.patchConversion(args.id, body);
  return `Unit conversion updated.\n\n${emit(args.format === 'full' ? r : slimConversion(r))}`;
}

export async function handleDeleteUnitConversion(client: TandoorClient, args: DeleteUnitConversionArgs): Promise<string> {
  await client.unitConversions.deleteConversion(args.id);
  return `Unit conversion ${args.id} deleted.`;
}
