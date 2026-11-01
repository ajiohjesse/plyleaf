import { expect, test } from "vitest";
import { EngineError } from "~/engine/errors";
import type { DocInfo } from "~/engine/types";
import { createIntake, type IntakeEngine } from "~/intake/intake";
import { A4, makePdf } from "../helpers/pdf";

const pdf = (name: string) => new File([makePdf([A4])], name, { type: "application/pdf" });

/**
 * A fake engine whose opens finish only when the test says so, so we can look at the intake in between. Files named
 * "locked…" fail with password-required (wrong-password with a password other than "open sesame"), "broken…" with
 * invalid-file and "offline…" with engine-unavailable.
 */
function fakeEngine() {
  const pending: { name: string; finish: () => void }[] = [];
  const open = new Set<string>();
  const closed: string[] = [];
  const resetListeners = new Set<(error: EngineError) => void>();
  let nextId = 1;
  const engine: IntakeEngine = {
    onReset: (listener) => {
      resetListeners.add(listener);
      return () => resetListeners.delete(listener);
    },
    open: (file, password) =>
      new Promise<DocInfo>((resolve, reject) => {
        const name = (file as File).name;
        pending.push({
          name,
          finish: () => {
            if (name.startsWith("locked") && password !== "open sesame") {
              return reject(new EngineError(password === undefined ? "password-required" : "wrong-password", "locked"));
            }
            if (name.startsWith("broken")) return reject(new EngineError("invalid-file", "broken"));
            if (name.startsWith("offline")) return reject(new EngineError("engine-unavailable", "offline"));
            const id = `d${nextId++}`;
            open.add(id);
            resolve({
              id,
              source: "pdf",
              pageCount: 3,
              pages: [],
              repaired: false,
              encryption: null,
              unlockedWith: null,
              annotations: 0,
              formFields: 0,
              permissions: ["print", "print-hq", "copy", "edit", "annotate", "form", "assemble", "accessibility"],
            });
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
  /** The engine restarts and loses every open document. */
  function crash() {
    open.clear();
    for (const listener of resetListeners) listener(new EngineError("engine-crashed", "crashed"));
  }
  return { engine, open, closed, finishNext, pending, crash, resetListeners };
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
    "locked.pdf is protected with a password. Remove it with Unlock PDF first (you'll need the password).",
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

test("moves documents within the list, even while one is still opening", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const done = intake.add([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
  await fake.finishNext();
  const names = () => intake.getState().documents.map((doc) => doc.name);
  const key = (name: string) => intake.getState().documents.find((doc) => doc.name === name)!.key;

  intake.move(key("a.pdf"), 2);
  expect(names()).toEqual(["b.pdf", "c.pdf", "a.pdf"]);
  intake.move(key("c.pdf"), -5);
  expect(names()).toEqual(["c.pdf", "b.pdf", "a.pdf"]);
  intake.move(key("b.pdf"), 99);
  expect(names()).toEqual(["c.pdf", "a.pdf", "b.pdf"]);

  // A no-op tells nobody.
  let changes = 0;
  const stop = intake.subscribe(() => changes++);
  intake.move(key("c.pdf"), 0);
  intake.move("missing", 1);
  expect(changes).toBe(0);
  stop();

  // b and c finish opening where they now are.
  await fake.finishNext();
  await fake.finishNext();
  await done;
  expect(intake.getState().documents.map((doc) => [doc.name, doc.status])).toEqual([
    ["c.pdf", "ready"],
    ["a.pdf", "ready"],
    ["b.pdf", "ready"],
  ]);
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

/** A file of exactly `size` bytes with a PDF header (intake only sniffs it; the fake engine opens anything). */
const sized = (name: string, size: number) => {
  const bytes = new Uint8Array(size).fill(32);
  bytes.set(new TextEncoder().encode("%PDF-"));
  return new File([bytes], name);
};

test("warns once when the open files get large, and again only after they've dropped below", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine, { largeInputBytes: 1000 });
  const first = intake.add([sized("a.pdf", 600)]);
  await fake.finishNext();
  await first;
  expect(intake.getState().notices).toEqual([]);

  const second = intake.add([sized("b.pdf", 600)]);
  await until(() => intake.getState().notices.length > 0);
  expect(intake.getState().notices).toMatchObject([
    {
      tone: "warning",
      message:
        "Together your files are 1 KB. That's a lot for a browser to hold in memory, so this may be slow, and if " +
        "it runs out, try fewer files at a time.",
    },
  ]);
  await fake.finishNext();
  await second;
  // Both files were still added.
  expect(intake.getState().documents.map((d) => d.status)).toEqual(["ready", "ready"]);

  const third = intake.add([sized("c.pdf", 100)]);
  await fake.finishNext();
  await third;
  expect(intake.getState().notices).toEqual([]);

  for (const doc of intake.getState().documents.slice(1)) await intake.remove(doc.key);
  const fourth = intake.add([sized("d.pdf", 600)]);
  await fake.finishNext();
  await fourth;
  expect(intake.getState().notices).toMatchObject([{ tone: "warning" }]);
});

test("says once that the engine couldn't load, however many files it was opening", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  const done = intake.add([pdf("offline-a.pdf"), pdf("offline-b.pdf")]);
  await fake.finishNext();
  await fake.finishNext();
  await done;
  expect(intake.getState().notices).toMatchObject([
    {
      tone: "error",
      message:
        "Plyleaf couldn't load its PDF engine. Check your internet connection and try again (it's only needed once).",
    },
  ]);
});

test("drops the documents an engine restart lost, while anything is subscribed", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine);
  // Not following the engine until something subscribes.
  expect(fake.resetListeners.size).toBe(0);
  const unsubscribe = intake.subscribe(() => {});
  expect(fake.resetListeners.size).toBe(1);

  const done = intake.add([pdf("a.pdf"), pdf("b.pdf"), pdf("c.pdf")]);
  await fake.finishNext();
  await fake.finishNext();
  fake.crash();
  // The two open documents are gone; the one still opening stays until its open settles.
  expect(intake.getState()).toMatchObject({
    documents: [{ name: "c.pdf", status: "opening" }],
    notices: [
      {
        tone: "error",
        message:
          "Plyleaf's PDF engine stopped, so your files were closed. Add them again to carry on (fewer at a time if " +
          "they're large).",
      },
    ],
  });
  await fake.finishNext();
  await done;
  expect(intake.getState().documents.map((d) => d.name)).toEqual(["c.pdf"]);

  unsubscribe();
  expect(fake.resetListeners.size).toBe(0);
});

test("takes the large-input warning back when a file that pushed it over doesn't open", async () => {
  const fake = fakeEngine();
  const intake = createIntake(fake.engine, { largeInputBytes: 1000 });
  const done = intake.add([sized("a.pdf", 600), sized("broken.pdf", 600)]);
  await until(() => intake.getState().notices.length > 0);
  expect(intake.getState().notices.map((n) => n.tone)).toEqual(["warning"]);
  await fake.finishNext();
  await fake.finishNext();
  await done;
  expect(intake.getState().notices).toMatchObject([
    { tone: "error", message: "broken.pdf couldn't be opened. It may be damaged, or not really a PDF." },
  ]);
});

test("with passwords on, a protected PDF waits for its password", async () => {
  const { engine, finishNext } = fakeEngine();
  const intake = createIntake(engine, { passwords: true, multiple: false });
  const adding = intake.add([pdf("locked.pdf")]);
  await finishNext();
  await adding;
  expect(intake.getState().documents).toMatchObject([{ name: "locked.pdf", status: "locked", wrongPassword: false }]);
  expect(intake.getState().notices).toEqual([]);

  const wrong = intake.unlock(intake.getState().documents[0]!.key, "guess");
  expect(intake.getState().documents[0]!.status).toBe("opening");
  await finishNext();
  await wrong;
  expect(intake.getState().documents).toMatchObject([{ status: "locked", wrongPassword: true }]);

  const right = intake.unlock(intake.getState().documents[0]!.key, "open sesame");
  await finishNext();
  await right;
  expect(intake.getState().documents).toMatchObject([{ name: "locked.pdf", status: "ready" }]);
});
