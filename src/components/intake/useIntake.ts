import { useState, useSyncExternalStore } from "react";
import { engine } from "~/engine/client";
import type { IntakeOptions } from "~/intake/files";
import { createIntake, type Intake, type IntakeState } from "~/intake/intake";

/** One intake for the lifetime of the component, backed by the real engine. */
export function useIntake(options: IntakeOptions = {}): [IntakeState, Intake] {
  const [intake] = useState(() => createIntake(engine, options));
  const state = useSyncExternalStore(intake.subscribe, intake.getState, intake.getState);
  return [state, intake];
}
