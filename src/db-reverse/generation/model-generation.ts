import { EntityTemplate } from "./../templates/entity.template";
import { loadOtFiles } from "@merlin-gql/core";
import { InputsTemplate } from "./../templates/inputs.template";
import { ResolverTemplate } from "./../templates/resolver.template";
import * as Prettier from "prettier";
import * as changeCase from "change-case";
import * as fs from "fs";
import * as path from "path";
import IGenerationOptions from "../options/generation-options.interface";
import { Entity } from "../models/entity";
import { Relation } from "../models/relation";
import { singular } from "pluralize";
import { ModelGenerationOptions } from "../../commands/generate/crud";
import { resetMetadataStorage, resolverIncludesOperation } from "@merlin-gql/core";
import { FilterTemplate } from "../templates/filters.template";
import { SortTemplate } from "../templates/sorts.template";
import { ObjectTypeTemplate } from "../templates/object-type.template";

const GENERATED_DIRECTORY_NAME = "_generated";

const prettierOptions: Prettier.Options = {
  parser: "typescript",
  endOfLine: "auto",
  tabWidth: 4,
  printWidth: 200,
};

export const populateTypeGraphQLMetadata = async () => {
  try {
    await loadOtFiles();
  } catch (e) {
    throw e;
  }
};

export const generator = async (
  generationOptions: IGenerationOptions,
  databaseModel: Entity[],
  flags?: ModelGenerationOptions
) => {
  try {
    resetMetadataStorage();
    await populateTypeGraphQLMetadata();

    const resultPath = generationOptions.resultsPath;
    if (!fs.existsSync(resultPath)) {
      fs.mkdirSync(resultPath);
    }

    let entitiesPath = resultPath;
    let generatedPath = resultPath;

    if (!generationOptions.noConfigs) {
      entitiesPath = path.resolve(resultPath, "./models");
      if (!fs.existsSync(entitiesPath)) {
        fs.mkdirSync(entitiesPath);
      }
    }

    generatedPath = path.resolve(resultPath, `./${GENERATED_DIRECTORY_NAME}`);
    if (!fs.existsSync(generatedPath)) {
      fs.mkdirSync(generatedPath);
    }

    generateGraphQLFiles(databaseModel, generationOptions, resultPath, flags);
  } catch (e) {
    throw e;
  }
};

const generateGraphQLFiles = (
  databaseModel: Entity[],
  generationOptions: IGenerationOptions,
  generationPath: string,
  flags?: ModelGenerationOptions
) => {
  databaseModel.forEach((element) => {
    let casedFileName = "";
    switch (generationOptions.convertCaseFile) {
      case "camel":
        casedFileName = changeCase.camelCase(element.tscName);
        break;
      case "param":
        casedFileName = changeCase.paramCase(element.tscName);
        break;
      case "pascal":
        casedFileName = changeCase.pascalCase(element.tscName);
        break;
      case "none":
        casedFileName = element.tscName;
        break;
      default:
        throw new Error("Unknown case style 1");
    }

    element.tscName = singular(element.tscName);
    let baseFileName = singular(casedFileName);
    let filesPathModels = path.join(generationPath, "models", baseFileName);
    let generatedPathModel = path.join(
      generationPath,
      GENERATED_DIRECTORY_NAME,
      baseFileName
    );
    //let filesPathResolvers = path.join(entitiesPath, "resolvers");

    fs.mkdirSync(filesPathModels, { recursive: true });
    fs.mkdirSync(generatedPathModel, { recursive: true });
    //fs.mkdirSync(filesPathResolvers, { recursive: true });

    if (!flags || flags.model) {
      generateEntity(generationOptions, baseFileName, filesPathModels, element);
    }

    if (!flags || flags.objectType) {
      generateObjectType(
        generationOptions,
        baseFileName,
        filesPathModels,
        element
      );
    }
    const shouldGenerateFilterAndSortAccordingToMetadata = resolverIncludesOperation(element.tscName, "LIST")
    if (!flags || flags.filter || (!flags?.filter &&  shouldGenerateFilterAndSortAccordingToMetadata)) {
      generateFilters(
        generationOptions,
        baseFileName,
        generatedPathModel,
        element
      );
    }

    if (!flags || flags.sort || (!flags?.filter &&  shouldGenerateFilterAndSortAccordingToMetadata)) {
      generateSort(
        generationOptions,
        baseFileName,
        generatedPathModel,
        element
      );
    }
    const shouldGenerateCreateInputAccordingToMetadata = resolverIncludesOperation(element.tscName, "CREATE")
    const shouldGenerateUpdateInputAccordingToMetadata = resolverIncludesOperation(element.tscName, "UPDATE")


    if (!flags || flags.input || (!flags?.input && (shouldGenerateCreateInputAccordingToMetadata || shouldGenerateUpdateInputAccordingToMetadata))) {
      generateInput(
        generationOptions,
        baseFileName,
        generatedPathModel,
        element
      );
    }

    if (!flags || flags.resolver) {
      generateResolver(
        generationOptions,
        baseFileName,
        generatedPathModel,
        element
      );
    }
  });
};

const generateEntity = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  //entityCompliedTemplate: HandlebarsTemplateDelegate<any>,
  element: Entity
) => {
  const filePath = path.resolve(filesPath, `${baseFileName}.model.ts`);
  const rendered = EntityTemplate(element, generationOptions);
  writeFile(rendered, generationOptions, element, filePath);
};

const generateObjectType = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  //entityCompliedTemplate: HandlebarsTemplateDelegate<any>,
  element: Entity
) => {
  const filePath = path.resolve(filesPath, `${baseFileName}.ot.ts`);
  const rendered = ObjectTypeTemplate(element, generationOptions);
  writeFile(rendered, generationOptions, element, filePath);
};

const generateFilters = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  element: Entity
) => {
  //const filePath = path.resolve(filesPath, `${baseFileName}.filter.ts`);
  const filePath = path.resolve(filesPath, `${baseFileName}.filter.ts`);
  const rendered = FilterTemplate(element, generationOptions);
  writeFile(rendered, generationOptions, element, filePath);
};

const generateSort = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  element: Entity
) => {
  const filePath = path.resolve(filesPath, `${baseFileName}.sort.ts`);
  const rendered = SortTemplate(element, generationOptions);
  writeFile(rendered, generationOptions, element, filePath);
};

const generateInput = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  element: Entity,
  create:boolean = true,
  update:boolean = true
) => {
  const filePath = path.resolve(filesPath, `${baseFileName}.input.ts`);

  const rendered = InputsTemplate(
    element.tscName,
    element.columns,
    generationOptions,
    create,
    update
  );
  writeFile(rendered, generationOptions, element, filePath);
};

const generateResolver = (
  generationOptions: IGenerationOptions,
  baseFileName: string,
  filesPath: string,
  element: Entity
) => {
  const filePath = path.resolve(filesPath, `${baseFileName}.resolver.ts`);

  const rendered = ResolverTemplate(element.tscName, generationOptions);
  writeFile(rendered, generationOptions, element, filePath);
};

const writeFile = (
  rendered: any,
  generationOptions: IGenerationOptions,
  element: Entity,
  filePath: string
) => {
  /*const withImportStatements = removeUnusedImports(
    EOL !== eolConverter[generationOptions.convertEol]
      ? rendered.replace(
          /(\r\n|\n|\r)/gm,
          eolConverter[generationOptions.convertEol]
        )
      : rendered
  );*/
  let formatted = "";
  try {
    formatted = !isJsonFile(filePath)
      ? Prettier.format(rendered, prettierOptions)
      : rendered;
  } catch (error) {
    console.error(
      "There were some problems with model generation for table: ",
      element.sqlName
    );
    console.error(error);
    formatted = rendered;
  }
  fs.writeFileSync(filePath, formatted, {
    encoding: "utf-8",
    flag: "w",
  });
};

const isJsonFile = (filename: string) => {
  return /\.json$/i.test(filename);
};

const removeUnusedImports = (rendered: string) => {
  const openBracketIndex = rendered.indexOf("{") + 1;
  const closeBracketIndex = rendered.indexOf("}");
  const imports = rendered
    .substring(openBracketIndex, closeBracketIndex)
    .split(",");
  const restOfEntityDefinition = rendered.substring(closeBracketIndex);

  const distinctImports = imports.filter(
    (v) =>
      restOfEntityDefinition.indexOf(`@${v}(`) !== -1 ||
      (v === "BaseEntity" && restOfEntityDefinition.indexOf(v) !== -1) ||
      (v === "InputType" && restOfEntityDefinition.indexOf(v) !== -1)
  );

  return `${rendered.substring(0, openBracketIndex)}${distinctImports.join(
    ","
  )}${restOfEntityDefinition}`;
};

export const toEntityName = (
  name: string,
  generationOptions: IGenerationOptions
) => singular(getEntityName(generationOptions.convertCaseEntity, name));

export const toEntityOTName = (
  name: string,
  generationOptions: IGenerationOptions
) => singular(getEntityName(generationOptions.convertCaseEntity, name) + "OT");

export const toFileName = (
  name: string,
  generationOptions: IGenerationOptions
) => {
  return singular(getEntityName(generationOptions.convertCaseFile, name));
};

export const toEntityOTFileName = (
  name: string,
  generationOptions: IGenerationOptions
) => singular(getEntityName(generationOptions.convertCaseFile, name)) + ".ot";

export const toEntityFileName = (
  name: string,
  generationOptions: IGenerationOptions
) =>
  singular(getEntityName(generationOptions.convertCaseFile, name)) + ".model";

export const toInputFileName = (
  name: string,
  generationOptions: IGenerationOptions
) =>
  singular(getEntityName(generationOptions.convertCaseFile, name)) + ".input";

export const toFilterFileName = (
  name: string,
  generationOptions: IGenerationOptions
) =>
  singular(getEntityName(generationOptions.convertCaseFile, name)) + ".filter";

export const toSortFileName = (
  name: string,
  generationOptions: IGenerationOptions
) => singular(getEntityName(generationOptions.convertCaseFile, name)) + ".sort";

export const toLocalImport = (
  name: string,
  generationOptions: IGenerationOptions
) => (generationOptions.exportType === "default" ? name : `{ ${name} }`);

export const toLocalOTImport = (
  name: string,
  generationOptions: IGenerationOptions
) => (generationOptions.exportType === "default" ? name : `{ ${name}OT }`);

export const toFiltersName = (
  name: string,
  generationOptions: IGenerationOptions
) =>
  singular(getEntityName(generationOptions.convertCaseEntity, name)) +
  "Filters";

export const toInputsName = (
  name: string,
  generationOptions: IGenerationOptions
) => {
  return getEntityName(generationOptions.convertCaseEntity, name) + "Inputs";
};

export const toInputsCreateName = (
  name: string,
  generationOptions: IGenerationOptions
) => {
  return (
    getEntityName(generationOptions.convertCaseEntity, name) + "CreateInput"
  );
};

export const toInputsUpdateName = (
  name: string,
  generationOptions: IGenerationOptions
) => {
  return (
    getEntityName(generationOptions.convertCaseEntity, name) + "UpdateInput"
  );
};

export const toSortsName = (
  name: string,
  generationOptions: IGenerationOptions
) =>
  singular(getEntityName(generationOptions.convertCaseEntity, name)) + "Sorts";

export const toPropertyName = (
  name: string,
  generationOptions: IGenerationOptions
) => getEntityName(generationOptions.convertCaseProperty, name);

export const toJson = (context: any) => {
  const json = JSON.stringify(context);
  const withoutQuotes = json.replace(/"([^(")"]+)":/g, "$1:");
  return withoutQuotes.slice(1, withoutQuotes.length - 1);
};

export const printPropertyVisibility = (
  generationOptions: IGenerationOptions
) => {
  return generationOptions.propertyVisibility !== "none"
    ? `${generationOptions.propertyVisibility} `
    : "";
};

export const toRelation = (
  entityType: string,
  relationType: Relation["relationType"],
  generationOptions: IGenerationOptions
) => {
  let retVal = entityType;
  if (relationType === "ManyToMany" || relationType === "OneToMany") {
    retVal = `${retVal}[]`;
  }
  if (generationOptions.lazy) {
    retVal = `Promise<${retVal}>`;
  }
  return retVal;
};

export const toGraphQLModelRelation = (
  entityType: string,
  relationType: Relation["relationType"]
) => {
  let retVal = `${entityType}`;
  if (relationType === "ManyToMany" || relationType === "OneToMany") {
    retVal = `[${retVal}]`;
  } else {
    retVal = `${retVal}`;
  }
  return retVal;
};

export const toGraphQLSortRelation = (
  entityType: string,
  relationType: Relation["relationType"]
) => {
  let retVal = entityType;
  //FIX to allow nested sorts. Sorts doesn´t have to honor model, it´s a simple relation (1 to 1) to allow nested sorts
  // if (relationType === "ManyToMany" || relationType === "OneToMany") {
  //   retVal = `[${retVal}Sorts]`;
  // } else {
  retVal = `${retVal}Sorts`;
  //}
  return retVal;
};

export const toGraphQLSortRelationType = (
  entityType: string,
  relationType: Relation["relationType"]
) => {
  let retVal = entityType;
  //FIX to allow nested filters. Filters doesn´t have to honor model, it´s a simple relation (1 to 1) to allow nested filter
  // if (relationType === "ManyToMany" || relationType === "OneToMany") {
  //   retVal = `${retVal}Filters[]`;
  // } else {
  retVal = `${retVal}`;
  //}
  return retVal;
};

export const toGraphQLFilterRelation = (
  entityType: string,
  relationType: Relation["relationType"]
) => {
  let retVal = entityType;
  //FIX to allow nested filters. Filters doesn´t have to honor model, it´s a simple relation (1 to 1) to allow nested filter
  // if (relationType === "ManyToMany" || relationType === "OneToMany") {
  //   retVal = `[${retVal}Filters]`;
  // } else {
  retVal = `${retVal}Filters`;
  //}
  return retVal;
};

export const toGraphQLFilterRelationType = (
  entityType: string,
  relationType: Relation["relationType"]
) => {
  let retVal = entityType;
  //FIX to allow nested filters. Filters doesn´t have to honor model, it´s a simple relation (1 to 1) to allow nested filter
  // if (relationType === "ManyToMany" || relationType === "OneToMany") {
  //   retVal = `${retVal}Filters[]`;
  // } else {
  retVal = `${retVal}Filters`;
  //}
  return retVal;
};

export const defaultExport = (generationOptions: IGenerationOptions) => {
  return generationOptions.exportType === "default" ? "default" : "";
};

export const strictMode = (generationOptions: IGenerationOptions) => {
  return generationOptions.strictMode !== "none"
    ? generationOptions.strictMode
    : "";
};

export const toEntityDirectoryName = (
  str: string,
  generationOptions: IGenerationOptions
) => {
  return singular(getEntityName(generationOptions.convertCaseFile, str));
};

const getEntityName = (convertCase: string, str: string) => {
  let retStr = "";
  switch (convertCase) {
    case "camel":
      retStr = changeCase.camelCase(str);
      break;
    case "param":
      retStr = changeCase.paramCase(str);
      break;
    case "pascal":
      retStr = changeCase.pascalCase(str);
      break;
    case "snake":
      retStr = changeCase.snakeCase(str);
      break;
    case "none":
      retStr = str;
      break;
    default:
      throw new Error("Unknown case style 2");
  }
  return retStr;
};

export default generator;
