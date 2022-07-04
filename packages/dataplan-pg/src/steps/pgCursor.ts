import type { CrystalResultsList, CrystalValuesList } from "dataplanner";
import { ExecutableStep, list } from "dataplanner";
import sql from "pg-sql2";

import { TYPES } from "../codecs.js";
import { PgSelectSingleStep } from "./pgSelectSingle.js";

/**
 * Given a PgSelectSingleStep, this will build a cursor by looking at all the
 * orders applied and then fetching them and building a cursor string from
 * them.
 */
export class PgCursorStep<
  TStep extends PgSelectSingleStep<any, any, any, any>,
> extends ExecutableStep<any> {
  static $$export = {
    moduleName: "@dataplan/pg",
    exportName: "PgCursorStep",
  };
  isSyncAndSafe = true;

  private cursorValuesDepId: number;
  private classSinglePlanId: string;
  private digest: string;

  constructor(itemPlan: TStep) {
    super();
    const classPlan = itemPlan.getClassPlan();
    this.classSinglePlanId = itemPlan.id;
    this.digest = classPlan.getOrderByDigest();
    const orders = classPlan.getOrderBy();
    const plan = list(
      orders.length > 0
        ? orders.map((o) => itemPlan.expression(o.fragment, o.codec))
        : // No ordering; so use row number
          [
            itemPlan.expression(
              sql`row_number() over (partition by 1)`,
              TYPES.int,
            ),
          ],
    );
    this.cursorValuesDepId = this.addDependency(plan);
  }

  public getClassSinglePlan(): TStep {
    const plan = this.getPlan(this.classSinglePlanId);
    if (!(plan instanceof PgSelectSingleStep)) {
      throw new Error(
        `Expected ${this.classSinglePlanId} (${plan}) to be a PgSelectSingleStep`,
      );
    }
    return plan as TStep;
  }

  execute(
    values: [CrystalValuesList<any[] | null>],
  ): CrystalResultsList<string | null> {
    return values[this.cursorValuesDepId].map((v) => {
      return v == null || v!.every((v) => v == null)
        ? null
        : Buffer.from(JSON.stringify([this.digest, ...v]), "utf8").toString(
            "base64",
          );
    });
  }
}