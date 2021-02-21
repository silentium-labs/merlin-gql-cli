import { Column } from "./../../db-reverse/models/column";
import { Command, flags } from "@oclif/command";
import {
  createConnection,
  ConnectionOptionsReader,
  EntityMetadata,
  ColumnType,
  Connection,
} from "typeorm";
import { cli } from "cli-ux";
import { Entity, Relation } from "../../db-reverse/library";
import { makeDefaultConfigs, readTOMLConfig } from "../../db-reverse";
import generator from "../../db-reverse/generation/model-generation";
import inquirer from "inquirer";
import chalk from "chalk";
import { emoji } from "node-emoji";
import { resolve } from "path";
import { RelationMetadata } from "typeorm/metadata/RelationMetadata";
import { ColumnMetadata } from "typeorm/metadata/ColumnMetadata";
import LocalCommand from "../core/local-command";

export type ModelGenerationOptions = {
  model?: boolean;
  objectType?: boolean;
  input?: boolean;
  filter?: boolean;
  sort?: boolean;
  resolver?: boolean;
};

export default class GenerateCrud extends LocalCommand {
  static description = `Generate input, filter, sort GraphQL models and GraphQL resolvers from entity models.\n
    Usage: merlin-gql generate:crud -i -f -s -r\n
    You can also run program without specifying any parameters to launch interactive mode.`;

  static examples = [`$ merlin-gql generate:crud`];

  static flags = {
    help: flags.help(),
    input: flags.boolean({
      char: "i",
      description: "Generate input GraphQL model from entity model",
    }),
    filter: flags.boolean({
      char: "f",
      description: "Generate filter GraphQL model from entity model",
    }),
    sort: flags.boolean({
      char: "s",
      description: "Generate sort GraphQL model from entity model",
    }),
    resolver: flags.boolean({
      char: "r",
      description: "Generate GraphQL resolver from entity model",
    }),
    all: flags.boolean({
      char: "a",
      description: "Generate for all model entities",
    }),
  };

  static args = [];

  async run() {
    try {
      this.checks();

      const { args, flags } = this.parse(GenerateCrud);
      let connection: Connection | null = null;
      try {
        cli.action.start("Loading TypeORM entities");
        connection = await getConnection();
        cli.action.stop();
        //Check generation options
        if (!flags.input && !flags.filter && !flags.sort && !flags.resolver) {
          const options: { options: string[] } = await inquirer.prompt([
            {
              name: "options",
              message: `What kind of files would you like to generate?`,
              type: "checkbox",
              choices: ["inputs", "filters", "sorts", "resolvers"],
            },
          ]);

          for (const option of options.options) {
            switch (option) {
              case "inputs": {
                flags.input = true;
                break;
              }
              case "filters": {
                flags.filter = true;
                break;
              }
              case "sorts": {
                flags.sort = true;
                break;
              }
              case "resolvers": {
                flags.resolver = true;
                break;
              }
            }
          }
        }

        if (!flags.input && !flags.filter && !flags.sort && !flags.resolver) {
          this.log(
            `${chalk.cyan.bold("No files types selected")} ${emoji.airplane_departure
            } . Finished`
          );
          return;
        }
        //End check generation options

        let entities = await gatherModelsInfo(connection);

        if (!flags.all) {
          const selectedModels: { models: string[] } = await inquirer.prompt([
            {
              name: "models",
              message: `Select the target models`,
              type: "checkbox",
              choices: (answers) => getAllTables(connection!),
            },
          ]);

          if (selectedModels.models.length > 0) {
            entities = entities.filter((entity) =>
              selectedModels.models.some((model) => model === entity.tscName)
            );
          } else {
            this.log(
              `${chalk.cyan.bold("No models selected")} ${emoji.airplane_departure
              } . Finished`
            );
            return;
          }
        }
        cli.action.start(
          `${chalk.cyan.bold(`Generating files.`)} ${emoji.pizza}`
        );

        let configOptions = makeDefaultConfigs();

        await generator(configOptions.generationOptions, entities, flags);
        cli.action.stop();
      } catch (error) {
        this.log(error);
      } finally {
        connection?.close();
      }
    } catch (e) {
      this.error(e);
    }
  }
}

export const getConnection = async () => {
  const connectionOptionsReader = new ConnectionOptionsReader({
    root: process.cwd(),
    configName: "ormconfig",
  });

  const connectionOptions = {
    ...(await connectionOptionsReader.get("default")),
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: false,
  };

  return await createConnection(connectionOptions);
};

const getAllTables = async (connection: Connection) => {
  const tables: { name: string; value: string }[] = [];
  const entitiesMetadata = connection.entityMetadatas;
  entitiesMetadata.forEach((metadata) => {
    const table: { name: string; value: string } = {
      name: metadata.name,
      value: metadata.name,
    };
    tables.push(table);
  });
  return tables;
};

export const gatherModelsInfo = async (connection: Connection) => {
  const entitiesMetadata = connection.entityMetadatas;
  const entities = generateModelEntities(entitiesMetadata);
  return entities;
};

const generateModelEntities = (entityMetadata: EntityMetadata[]) => {
  const entities: Entity[] = [];
  for (const metadata of entityMetadata) {
    let entity: Entity = {
      sqlName: metadata.tableName,
      tscName: metadata.name,
      relationIds: [],
      relations: [],
      fileImports: [],
      indices: [],
      columns: [],
    };
    const columns = generateColumns(metadata.columns);
    const relations = generateRelations(metadata.relations);

    entity.columns = columns;
    entity.relations = relations;
    entity.fileImports = relations.map((relation) => relation.relatedTable);
    entities.push(entity);
  }
  return entities;
};

const generateColumns = (cols: ColumnMetadata[]) => {
  const columns: Column[] = [];

  cols.forEach((columnMetadata) => {
    if (!columnMetadata.relationMetadata || (!!columnMetadata.relationMetadata && !!columnMetadata.referencedColumn)) {
      const column: Column = {
        tscName: columnMetadata.propertyName,
        tscType: getColumnTscType(columnMetadata.type),
        type: !!columnMetadata.referencedColumn ? "id" : columnMetadata.type,
        primary: columnMetadata.isPrimary,
        generated: columnMetadata.generationStrategy && ["increment", "uuid"].includes(columnMetadata.generationStrategy) ? columnMetadata.generationStrategy as "increment" | "uuid" : columnMetadata.generationStrategy ? true : undefined,
        options: {
          name: columnMetadata.databaseName,
          nullable: columnMetadata.isNullable,
        },
      };
      columns.push(column);
    }
  });
  return columns;
};

const generateRelations = (
  relationsMetadata: RelationMetadata[]
): Relation[] => {
  const relations: Relation[] = [];
  relationsMetadata.forEach((metadata) => {
    const relation: Relation = {
      fieldName: metadata.propertyName,
      relationType: getRelationType(metadata),
      relatedField: metadata.inverseRelation?.propertyName!,
      relatedTable: metadata.inverseEntityMetadata.tableName,
    };
    relation.fieldName = metadata.propertyName;
    relations.push(relation);
  });
  return relations;
};

const getRelationType = (relation: RelationMetadata) => {
  return relation.isManyToMany
    ? "ManyToMany"
    : relation.isManyToOne
      ? "ManyToOne"
      : relation.isOneToMany
        ? "OneToMany"
        : "OneToOne";
};

const getColumnTscType = (columnType: ColumnType) => {
  switch (columnType) {
    case "character varying":
    case "varying character":
    case "char varying":
    case "nvarchar":
    case "national varchar":
    case "character":
    case "native character":
    case "varchar":
    case "char":
    case "nchar":
    case "national char":
    case "varchar2":
    case "nvarchar2":
    case "alphanum":
    case "shorttext":
    case "raw":
    case "binary":
    case "varbinary":
    case "tinytext":
    case "mediumtext":
    case "text":
    case "ntext":
    case "citext":
    case "longtext":
    case "alphanum":
    case "shorttext":
    case "uuid":
    case "string":
    case String: {
      return "string";
    }
    case "float":
    case "double":
    case "dec":
    case "decimal":
    case "smalldecimal":
    case "fixed":
    case "numeric":
    case "real":
    case "double precision":
    case "number":
    case "tinyint":
    case "smallint":
    case "mediumint":
    case "int":
    case "bigint":
    case "int2":
    case "integer":
    case "int4":
    case "int8":
    case "int64":
    case "unsigned big int":
    case "float":
    case "float4":
    case "float8":
    case "smallmoney":
    case "money":
    case "long":
    case Number: {
      return "number";
    }
    case "datetime":
    case "datetime2":
    case "datetimeoffset":
    case "time":
    case "time with time zone":
    case "time without time zone":
    case "timestamp":
    case "timestamp without time zone":
    case "timestamp with time zone":
    case "timestamp with local time zone":
    case "timetz":
    case "timestamptz":
    case "timestamp with local time zone":
    case "smalldatetime":
    case "date":
    case "interval year to month":
    case "interval day to second":
    case "interval":
    case Date: {
      return "Date";
    }
    case "boolean":
    case "bool":
    case Boolean: {
      return "boolean";
    }
    default: {
      return "string";
    }
  }
};
