import type { GraphQLInputType } from "graphql";
import { GraphQLList, Kind } from "graphql";

import * as assert from "../assert.js";
import type { InputStep } from "../input.js";
import { assertInputStep, inputPlan } from "../input.js";
import { ExecutableStep } from "../step.js";
import type { ConstantStep } from "./constant.js";
import { constant } from "./constant.js";
import { list } from "./list.js";
import { NotVariableValueNode } from "../interfaces.js";

/**
 * Implements `__InputListStep`.
 */
export class __InputListStep extends ExecutableStep {
  static $$export = {
    moduleName: "grafast",
    exportName: "__InputListStep",
  };
  isSyncAndSafe = true;

  private itemCount = 0;

  constructor(
    inputType: GraphQLList<GraphQLInputType>,
    seenTypes: ReadonlyArray<GraphQLInputType>,
    private readonly inputValues: NotVariableValueNode | undefined,
  ) {
    super();
    assert.ok(
      inputType instanceof GraphQLList,
      "Expected inputType to be a List",
    );
    const innerType = inputType.ofType;
    const values =
      inputValues?.kind === Kind.LIST
        ? inputValues.values
        : inputValues?.kind === Kind.NULL
        ? null
        : inputValues
        ? [inputValues]
        : inputValues;
    if (values) {
      for (
        let inputValueIndex = 0, inputValuesLength = values.length;
        inputValueIndex < inputValuesLength;
        inputValueIndex++
      ) {
        const inputValue = values[inputValueIndex];
        const innerPlan = inputPlan(
          this.operationPlan,
          innerType,
          inputValue,
          undefined,
          seenTypes,
        );
        this.addDependency(innerPlan);
        this.itemCount++;
      }
    }
  }

  optimize(): ExecutableStep {
    const { inputValues } = this;
    if (inputValues?.kind === "NullValue") {
      return constant(null);
    } else {
      const arr: InputStep[] = [];
      for (
        let itemPlanIndex = 0;
        itemPlanIndex < this.itemCount;
        itemPlanIndex++
      ) {
        const itemPlan = this.getDep(itemPlanIndex);
        assertInputStep(itemPlan);
        arr[itemPlanIndex] = itemPlan;
      }
      return list(arr);
    }
  }

  execute(): any[] {
    throw new Error(
      "__InputListStep should never execute; it should have been optimized away.",
    );
  }
  unbatchedExecute = (): any => {
    throw new Error(
      "__InputListStep should never execute; it should have been optimized away.",
    );
  };

  at(index: number): InputStep | ConstantStep<undefined> {
    const itemPlan =
      index < this.itemCount ? this.getDep(index) : constant(undefined);
    assertInputStep(itemPlan);
    return itemPlan;
  }

  eval(): any[] | null {
    if (this.inputValues?.kind === "NullValue") {
      return null;
    }
    const list: any[] = [];
    for (
      let itemPlanIndex = 0;
      itemPlanIndex < this.itemCount;
      itemPlanIndex++
    ) {
      const itemPlan = this.getDep(itemPlanIndex);
      assertInputStep(itemPlan);
      const value = itemPlan.eval();
      list[itemPlanIndex] = value;
    }
    return list;
  }

  evalIs(value: null | undefined | 0): boolean {
    if (value === undefined) {
      return this.inputValues === value;
    } else if (value === null) {
      return this.inputValues?.kind === "NullValue";
    } else {
      throw new Error(
        "__InputListStep cannot evalIs values other than null and undefined currently",
      );
    }
  }

  evalLength(): number | null {
    if (this.inputValues === undefined) {
      return null;
    } else if (this.inputValues.kind === Kind.NULL) {
      return null;
    } else if (this.inputValues.kind === Kind.LIST) {
      return this.inputValues.values.length;
    } else {
      // Coercion to list
      return 1;
    }
  }
}
