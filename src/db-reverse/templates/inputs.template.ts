import { propertyIsCreateInputIgnored, propertyIsDecoratedWithField, propertyIsUpdateInputIgnored } from "@merlin-gql/core";
import { ColumnType } from "typeorm";
import { Column } from "../models/column";
import { Entity } from "../models/entity";
import IGenerationOptions from "../options/generation-options.interface";
import {
  toEntityFileName,
  toEntityName,
  toFileName,
  toInputsCreateName,
  toInputsUpdateName,
  toPropertyName,
} from "./../generation/model-generation";

const defaultFilterType = (tscType: string, type: ColumnType | string, primary: boolean = false) => {
  if (primary || typeof type === "string" && type === "id") {
    return "ID";
  } else if (tscType === "string") {
    return "String";
  } else if (tscType === "number" && typeof type === "string" && type.includes("int")) {
    return "Int";
  } else if (tscType === "number") {
    return "Float";
  } else if (tscType === "Date") {
    return "Date";
  } else if (tscType === "boolean") {
    return "Boolean";
  }
};

const defaultValueIfNeeded = (nullable: boolean, tscType: string) => {
  if (nullable) {
    return "";
  } else if (!nullable && tscType === "string") {
    return ' = ""';
  } else if (!nullable && tscType === "number") {
    return " = 0";
  } else if (!nullable && tscType === "Date") {
    return " = new Date()";
  } else if (!nullable && tscType === "boolean") {
    return " = false";
  }
};

const ColumnTemplate = (
  column: Column,
  generationOptions: IGenerationOptions
) => {
  const fieldNullable = column.options.nullable ? `,{ nullable: true }` : "";
  const propertyName = toPropertyName(column.tscName, generationOptions);
  const questionMarkIfNullable = column.options.nullable ? "?" : "";
  const defaultType = defaultFilterType(column.tscType, column.type, column.primary);
  const defaultValue = defaultValueIfNeeded(
    !!column.options.nullable,
    column.tscType
  );
  return `
        @Field((_) => ${defaultType}${fieldNullable})
        ${propertyName}${questionMarkIfNullable}:${column.tscType}${defaultValue};
        `;
};

const ColumnUpdateTemplate = (
  column: Column,
  generationOptions: IGenerationOptions
) => {
  const defaultType = defaultFilterType(column.tscType, column.type, column.primary);
  const fieldNullable = `,{ nullable: true }`;
  const propertyName = toPropertyName(column.tscName, generationOptions);
  const questionMarkNullable = "?";
  return `
        @Field((_) => ${defaultType}${fieldNullable})
        ${propertyName}${questionMarkNullable}:${column.tscType};
        `;
};
// prettier-ignore
export const InputsTemplate = (
  entity: Entity,
  tscName: string,
  columns: Column[],
  generationOptions: IGenerationOptions,
  create: boolean = true,
  update: boolean = false
): string => {

  const entityName: string = toEntityName(tscName, generationOptions)
  const entityFileName: string = toEntityFileName(tscName, generationOptions)
  const inputsCreateName: string = toInputsCreateName(tscName, generationOptions);
  const inputUpdateName: string = toInputsUpdateName(tscName, generationOptions);
  const ignoreMetadata = generationOptions.graphqlFiles ?? false;
  const relations = entity.relations.filter(c => ignoreMetadata || (propertyIsDecoratedWithField(c.fieldName, entity.tscName))).map(r => r.fieldName)
  return `

      import {InputType, Field, Float, ID, Int} from "type-graphql";
      import { BaseInputFields } from "@merlin-gql/core";
      import { ${entityName} } from "../../models/${toFileName(tscName, generationOptions)}/${entityFileName}";

      ${create ? `@InputType()
      export class ${inputsCreateName} extends BaseInputFields implements Partial<${entityName}> {
        ${columns.filter(c => ignoreMetadata || (propertyIsDecoratedWithField(c.tscName, tscName) && !propertyIsCreateInputIgnored(c.tscName, tscName))).filter(c => !c.generated && !relations.includes(c.tscName)).map(c => ColumnTemplate(c, generationOptions)).join("\n")}
      }` : ''}

      ${update ? `
      @InputType()
      export class ${inputUpdateName} extends BaseInputFields implements Partial<${entityName}> {
        ${columns.filter(c => ignoreMetadata || (propertyIsDecoratedWithField(c.tscName, tscName) && !propertyIsUpdateInputIgnored(c.tscName, tscName))).filter(c => !c.primary && !relations.includes(c.tscName)).map(c => ColumnUpdateTemplate(c, generationOptions)).join("\n")}
      }` : ''}
      `
}
