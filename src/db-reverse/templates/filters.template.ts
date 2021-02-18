import {
  propertyIsDecoratedWithField,
  propertyIsFilterIgnored,
} from "@merlin-gql/core";
import { Column } from "../models/column";
import { Relation } from "../models/relation";
import IGenerationOptions from "../options/generation-options.interface";
import {
  defaultExport,
  toEntityDirectoryName,
  toEntityName,
  toFileName,
  toFiltersName,
  toGraphQLFilterRelation,
  toGraphQLFilterRelationType,
  toLocalImport,
  toPropertyName,
} from "./../generation/model-generation";
import { Entity } from "./../models/entity";

const defaultFilterType = (tscType: string) => {
  if (tscType === "string") {
    return "FilteredString";
  } else if (tscType === "number") {
    return "FilteredFloat";
  } else if (tscType === "Date") {
    return "FilteredDate";
  } else if (tscType === "boolean") {
    return "FilteredBoolean";
  }
};

// prettier-ignore
const ImportsTemplate = (fileImport: string, generationOptions: IGenerationOptions) => {
  return `
    import ${toLocalImport(toFiltersName(fileImport, generationOptions), generationOptions)} from "../${toEntityDirectoryName(fileImport, generationOptions)}/${toFileName(fileImport, generationOptions)}.filter";
    `;
};

// prettier-ignore
const ColumnTemplate = (
  column: Column,
  generationOptions: IGenerationOptions
) => {
  const propertyName = toPropertyName(column.tscName, generationOptions);
  const defaultValue = defaultFilterType(column.tscType);
  const graphqlDecorator = column.generated ?
    `@Field((_) => FilteredID, {nullable: true})` :
    `@Field((_) => ${defaultValue}, { nullable: true })`;

  return `
    ${graphqlDecorator}
    ${propertyName}?:${column.tscType};
  `;
};

// prettier-ignore
const RelationTemplate = (
  relation: Relation,
  generationOptions: IGenerationOptions
) => {
  const relatedTableEntityName = toEntityName(relation.relatedTable, generationOptions);
  const propertyName = `${toPropertyName(relation.fieldName, generationOptions)}?:${toGraphQLFilterRelationType(relatedTableEntityName, relation.relationType)};`
  return `
    @Field((_) =>  ${toGraphQLFilterRelation(relatedTableEntityName, relation.relationType)}, { nullable: true })
    ${propertyName}
    `;
};

// prettier-ignore
export const FilterTemplate = (
  entity: Entity,
  generationOptions: IGenerationOptions
): string => {

  const filterName: string = toFiltersName(entity.tscName, generationOptions);
  const ignoreMetadata = generationOptions.graphqlFiles ?? false;
  return `
        import {InputType,Field} from "type-graphql";
        import { BaseFilterFields, FilteredID, FilteredInt, FilteredFloat, FilteredBoolean, FilteredDate, FilteredString } from "@merlin-gql/core";
        ${entity.fileImports.map(fileImport => ImportsTemplate(fileImport,generationOptions)).join("\n")}

        @InputType()
        export ${defaultExport(generationOptions)} class ${filterName} extends BaseFilterFields {

          @Field((_) => [${filterName}], { nullable: true })
          or?: ${filterName}[];

          @Field((_) => [${filterName}], { nullable: true })
          and?: ${filterName}[];

          ${entity.columns.filter(c => ignoreMetadata || (propertyIsDecoratedWithField(c.tscName, entity.tscName) && !propertyIsFilterIgnored(c.tscName, entity.tscName))).map(c => ColumnTemplate(c, generationOptions)).join("\n")}

          ${entity.relations.filter(c => ignoreMetadata || (propertyIsDecoratedWithField(c.fieldName, entity.tscName) && !propertyIsFilterIgnored(c.fieldName, entity.tscName))).map(r => RelationTemplate(r, generationOptions)).join("\n")}
        }
      `
}
