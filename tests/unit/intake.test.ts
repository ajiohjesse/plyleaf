import { expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import type { DocInfo } from "~/engine/types";
import { createIntake, type IntakeEngine } from "~/intake/intake";
import { A4, makePdf } from "../helpers/pdf";

const pdf = (name: string) => new File([makePdf([A4])], name, { type: "application/pdf" });

/**
 * A fake engine whose opens finish only when the test says so, so we can look at the intake in between. Files named
 * "locked…" fail with password-required and "broken…" with invalid-file.
 */
function fakeEngine() {
  const pending: { name: string; finish: () => void }[] = [];
  const open = new Set<string>();
  const closed: string[] = [];
  let nextId = 1;
  const engine: IntakeEngine = {
    open: (file) =>
      new Promise<DocInfo>((resolve, reject) => {
        const name = (file as File).name;
        pending.push({
          name,
          finish: () => {
            if (name.startsWith("locked")) return reject(new EngineError("password-required", "locked"));
            if (name.startsWith("broken")) return reject(new EngineError("invalid-file", "broken"));
            const id = `d${nextId++}`;
            open.add(id);
            resolve({ id, pageCount: 3, pages: [], repaired: false });
          },
        });
      }),
    close: async (id) => {
      open.delete(id);
      closed.push(id);
    },
  };
  /** Lets the next queued open finish, then waits for the intake to react. */
  async function finishNext() {
    await until(() => pending.length > 0);
    pending.shift()!.finish();
    await new Promise((resolve) => setTimeout(resolve));
  }
  return { engine, open, closed, finishNext, pending };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i++) await new Promise((resolve) => setTimeout(resolve));
  expect(condition()).toBe(true);
}

test("opens accepted files one at a time, in order, and lists them", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const done = intake.add([pdf("a.pdf"), new File(["text"], "notes.txt"), pdf("b.pdf")]);

  await until(() => intake.getState().documents.length === 2);
  expect(intake.getState()).toMatchObject({
    busy: true,
    documents: [
      { name: "a.pdf", status: "opening" },
      { name: "b.pdf", status: "opening" },
    ],
    notices: [{ message: "notes.txt isn't a PDF." }],
  });
  // Only one open at a time.
  expect(fake.pending.map((p) => p.name)).toEqual(["a.pdf"]);

  await fake.finishNext();
  expect(intake.getState().documents.map((d) => d.status)).toEqual(["ready", "opening"]);
  await fake.finishNext();
  await done;
  expect(intake.getState()).toMatchObject({
    busy: false,
    documents: [
      { name: "a.pdf", status: "ready", info: { id: "d1", pageCount: 3 } },
      { name: "b.pdf", status: "ready", info: { id: "d2" } },
    ],
  });
});

test("drops files the engine can't open and says why", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const done = intake.add([pdf("locked.pdf"), pdf("ok.pdf"), pdf("broken.pdf")]);
  for (let i = 0; i < 3; i++) await fake.finishNext();
  await done;

  const state = intake.getState();
  expect(state.documents.map((d) => d.name)).toEqual(["ok.pdf"]);
  expect(state.notices.map((n) => n.message)).toEqual([
    "locked.pdf is protected with a password. Plyleaf can't open protected PDFs yet.",
    "broken.pdf couldn't be opened. It may be damaged, or not really a PDF.",
  ]);
});

test("each batch replaces the last batch's notices, and notices can be dismissed", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  await intake.add([new File(["x"], "one.txt"), new File(["x"], "two.txt")]);
  const [first] = intake.getState().notices;
  intake.dismiss(first!.id);
  expect(intake.getState().notices.map((n) => n.message)).toEqual(["two.txt isn't a PDF."]);

  await intake.add([new File([], "empty.pdf")]);
  expect(intake.getState().notices.map((n) => n.message)).toEqual(["empty.pdf is empty."]);
});

test("batches added while another is opening wait their turn", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const first = intake.add([pdf("a.pdf")]);
  const second = intake.add([pdf("b.pdf")]);
  await fake.finishNext();
  await first;
  expect(intake.getState().busy).toBe(true);
  await fake.finishNext();
  await second;
  expect(intake.getState().documents.map((d) => d.name)).toEqual(["a.pdf", "b.pdf"]);
  expect(intake.getState().busy).toBe(false);
});

test("removing a document closes it, even if it was still opening", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const done = intake.add([pdf("a.pdf"), pdf("b.pdf")]);
  await fake.finishNext();
  const [a, b] = intake.getState().documents;

  await intake.remove(a!.key);
  expect(fake.closed).toEqual(["d1"]);
  await intake.remove(b!.key);
  expect(intake.getState().documents).toEqual([]);
  await fake.finishNext();
  await done;
  expect(fake.closed).toEqual(["d1", "d2"]);
  expect(fake.open.size).toBe(0);
  expect(intake.getState().notices).toEqual([]);
});

test("a single-file intake swaps in the new file and closes the old one", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine, { multiple: false });
  const first = intake.add([pdf("old.pdf")]);
  await fake.finishNext();
  await first;

  // Nothing acceptable: the old file stays.
  await intake.add([new File(["x"], "notes.txt")]);
  expect(intake.getState().documents.map((d) => d.name)).toEqual(["old.pdf"]);

  const second = intake.add([pdf("new.pdf"), pdf("extra.pdf")]);
  await fake.finishNext();
  await second;
  expect(intake.getState().documents.map((d) => d.name)).toEqual(["new.pdf"]);
  expect(intake.getState().notices.map((n) => n.message)).toEqual([
    "extra.pdf was left out: this tool works on one file at a time.",
  ]);
  expect(fake.closed).toEqual(["d1"]);
});

test("tells subscribers about every change until they unsubscribe", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  let calls = 0;
  const unsubscribe = intake.subscribe(() => calls++);
  await intake.add([new File(["x"], "notes.txt")]);
  expect(calls).toBeGreaterThan(0);
  const seen = calls;
  unsubscribe();
  intake.dismiss(intake.getState().notices[0]!.id);
  expect(calls).toBe(seen);
});
