import "graphile-build";
import "./PgTablesPlugin.js";
import "graphile-config";

import type { PgSource } from "@dataplan/pg";
import { connection } from "grafast";
import { EXPORTABLE } from "graphile-export";
import type { GraphQLObjectType, GraphQLOutputType } from "graphql";

import { getBehavior } from "../behavior.js";
import { version } from "../index.js";
import { tagToString } from "../utils.js";

declare global {
  namespace GraphileBuild {
    interface Inflection {
      /**
       * The field name for a Cursor Connection field that returns all rows
       * from the given source.
       */
      allRowsConnection(
        this: Inflection,
        source: PgSource<any, any, any, any>,
      ): string;

      /**
       * The field name for a List field that returns all rows from the given
       * source.
       */
      allRowsList(
        this: Inflection,
        source: PgSource<any, any, any, any>,
      ): string;
    }
  }
}

export const PgAllRowsPlugin: GraphileConfig.Plugin = {
  name: "PgAllRowsPlugin",
  description: "Adds 'all rows' accessors for all table-like datasources.",
  version: version,
  // TODO: Requires PgTablesPlugin

  inflection: {
    add: {
      allRowsConnection(options, source) {
        return this.connectionField(
          this.camelCase(
            `all-${this.pluralize(this._singularizedSourceName(source))}`,
          ),
        );
      },
      allRowsList(options, source) {
        return this.listField(
          this.camelCase(
            `all-${this.pluralize(this._singularizedSourceName(source))}`,
          ),
        );
      },
    },
  },

  schema: {
    hooks: {
      GraphQLObjectType_fields(fields, build, context) {
        const {
          graphql: { GraphQLList, GraphQLNonNull },
        } = build;
        const { fieldWithHooks } = context;
        if (!context.scope.isRootQuery) {
          return fields;
        }
        for (const source of build.input.pgSources) {
          if (source.parameters) {
            // Skip functions
            continue;
          }
          if (!source.find || source.isVirtual) {
            continue;
          }
          const type = build.getTypeByName(
            build.inflection.tableType(source.codec),
          );
          if (!type) {
            continue;
          }

          const behavior = getBehavior([
            source.codec.extensions,
            source.extensions,
          ]);
          const defaultBehavior = "connection -list";

          if (build.behavior.matches(behavior, "query:list", defaultBehavior)) {
            const fieldName = build.inflection.allRowsList(source);
            fields = build.extend(
              fields,
              {
                [fieldName]: fieldWithHooks(
                  {
                    fieldName,
                    fieldBehaviorScope: `query:list`,
                    isPgFieldSimpleCollection: true,
                    pgSource: source,
                  },
                  () => ({
                    type: new GraphQLList(
                      new GraphQLNonNull(type),
                    ) as GraphQLOutputType,
                    description: `Reads a set of \`${build.inflection.tableType(
                      source.codec,
                    )}\`.`,
                    deprecationReason: tagToString(
                      source.extensions?.tags?.deprecated,
                    ),
                    plan: EXPORTABLE(
                      (source) =>
                        function plan() {
                          return source.find();
                        },
                      [source],
                    ),
                  }),
                ),
              },
              `Adding 'all rows' list field for PgSource ${source}`,
            );
          }

          if (
            build.behavior.matches(
              behavior,
              "query:connection",
              defaultBehavior,
            )
          ) {
            const fieldName = build.inflection.allRowsConnection(source);
            const connectionType = build.getTypeByName(
              build.inflection.tableConnectionType(source.codec),
            ) as GraphQLObjectType | undefined;
            if (connectionType) {
              fields = build.extend(
                fields,
                {
                  [fieldName]: fieldWithHooks(
                    {
                      fieldName,
                      fieldBehaviorScope: `query:connection`,
                      isPgFieldConnection: true,
                      pgSource: source,
                    },
                    () => ({
                      type: connectionType,
                      description: `Reads and enables pagination through a set of \`${build.inflection.tableType(
                        source.codec,
                      )}\`.`,
                      deprecationReason: tagToString(
                        source.extensions?.tags?.deprecated,
                      ),
                      plan: EXPORTABLE(
                        (connection, source) =>
                          function plan() {
                            return connection(source.find());
                          },
                        [connection, source],
                      ),
                    }),
                  ),
                },
                `Adding 'all rows' connection field for PgSource ${source}`,
              );
            }
          }
        }
        return fields;
      },
    },
  },
};