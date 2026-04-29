# Node Placement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagents are not used unless the user explicitly requests them.

**Goal:** Replace immediate palette node creation with click-to-place node creation on the canvas.

**Architecture:** Extract node construction into a reusable factory, lift pending placement state into `AppLayout`, and let `GraphCanvas` create nodes at pane click coordinates using React Flow coordinate conversion. Keep dirty-editor protection by wrapping placement creation in the existing editor transition runner.

**Tech Stack:** React, TypeScript, React Flow, Bun test, Testing Library.

---

## File Map

- Create `src/features/graph-editor/nodeFactory.ts`: shared palette metadata and `createNode(kind, index, position?)`.
- Modify `src/features/graph-editor/NodePalette.tsx`: palette buttons request placement instead of dispatching `add-node`.
- Modify `src/App.tsx`: owns pending placement state and wires palette to canvas.
- Modify `src/features/graph-editor/GraphCanvas.tsx`: converts pane click to flow position, creates pending node, supports `Esc` cancellation, and shows placement hint.
- Modify `src/features/i18n/types.ts` and `src/features/i18n/messages.ts`: add placement hint message.
- Modify `src/index.css`: add placement cursor and hint styling.
- Modify `src/features/graph-editor/NodePalette.test.tsx`: update expectations for placement mode.
- Modify `src/features/graph-editor/GraphCanvas.test.tsx`: add placement, selection, cancellation, and dirty-editor tests.

## Task 1: Extract Node Factory

**Files:**
- Create: `src/features/graph-editor/nodeFactory.ts`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Test: `src/features/graph-editor/NodePalette.test.tsx`

- [ ] **Step 1: Write the failing import/use test**

Update `NodePalette.test.tsx` to use the palette through new placement props:

```tsx
function PlacementProbe() {
  const [pendingKind, setPendingKind] = useState<NodeKind | null>(null);

  return (
    <>
      <NodePalette
        pendingKind={pendingKind}
        onRequestNodePlacement={(request) => setPendingKind(request.kind)}
      />
      <span data-testid="pending-kind">{pendingKind ?? "null"}</span>
    </>
  );
}
```

Assert clicking `Helper Functions` changes `pending-kind` to `helperFunctions` and does not add a node immediately.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/graph-editor/NodePalette.test.tsx`

Expected: fail because `NodePalette` does not accept placement props and still creates nodes immediately.

- [ ] **Step 3: Implement the factory and palette props**

Create `nodeFactory.ts` with exported `paletteItems` and `createNode`. Move the existing switch unchanged except `position` comes from an optional argument:

```ts
position: position ?? { x: 160 + index * 24, y: 120 + index * 24 }
```

Update `NodePalette` to call:

```tsx
onRequestNodePlacement({ kind: item.kind, label: t(item.messageKey) });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/graph-editor/NodePalette.test.tsx`

Expected: pass.

## Task 2: Add App-Level Pending Placement

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/features/graph-editor/NodePalette.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/i18n/types.ts`
- Modify: `src/features/i18n/messages.ts`
- Test: `src/App.test.tsx`

- [ ] **Step 1: Write failing integration test**

Add an `App` test that clicks `Select`, expects no immediate new node label, and expects placement hint text:

```tsx
await user.click(screen.getByRole("button", { name: "Select" }));
expect(screen.getByText("Click canvas to place Select · Esc to cancel")).toBeTruthy();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/App.test.tsx --test-name-pattern "placement"`

Expected: fail because the hint does not exist and palette still has no app-level placement state.

- [ ] **Step 3: Implement pending state and hint plumbing**

Add:

```ts
type PendingNodePlacement = { kind: NodeKind; label: string };
const [pendingNodePlacement, setPendingNodePlacement] =
  useState<PendingNodePlacement | null>(null);
```

Pass `pendingKind` and `onRequestNodePlacement` to `NodePalette`, and pass `pendingNodePlacement` plus `onClearPendingNodePlacement` to `GraphCanvas`.

Add i18n key `nodePlacement.hint`.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/App.test.tsx --test-name-pattern "placement"`

Expected: pass.

## Task 3: Place Node at Canvas Click

**Files:**
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`
- Modify: `src/index.css`

- [ ] **Step 1: Write failing canvas placement tests**

Add tests that render `GraphCanvas` with:

```tsx
pendingNodePlacement={{ kind: "where", label: "Where" }}
onClearPendingNodePlacement={clearSpy}
```

Mock `useReactFlow` to return:

```ts
screenToFlowPosition: ({ x, y }) => ({ x: x + 10, y: y + 20 })
```

Invoke `onPaneClick({ clientX: 30, clientY: 40 })` and assert the new `where` node exists at `40,60`, is selected, and its editor is open.

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx --test-name-pattern "pending"`

Expected: fail because `GraphCanvas` does not yet create from pending placement.

- [ ] **Step 3: Implement click placement**

Import `useReactFlow` and `createNode`. In `onPaneClick`, branch first on pending placement:

```ts
if (pendingNodePlacement) {
  const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
  const node = createNode(pendingNodePlacement.kind, state.document.nodes.length, position);
  runEditorTransition(() => {
    dispatch({ type: "add-node", node });
    dispatch({ type: "select-node", nodeId: node.id });
    dispatch({ type: "open-node-editor", nodeId: node.id });
    onClearPendingNodePlacement();
  });
  return;
}
```

Add `is-placing-node` class and `.node-placement-hint` markup.

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx --test-name-pattern "pending"`

Expected: pass.

## Task 4: Add Cancellation and Dirty Editor Protection

**Files:**
- Modify: `src/features/graph-editor/GraphCanvas.tsx`
- Modify: `src/features/graph-editor/GraphCanvas.test.tsx`

- [ ] **Step 1: Write failing cancellation and dirty tests**

Add one test that presses `Escape` while pending and expects `onClearPendingNodePlacement` to be called.

Add one test that opens a node editor, makes it dirty, clicks canvas while pending, expects discard confirmation, clicks `Keep editing`, and expects pending placement to remain visible.

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx --test-name-pattern "pending|Escape|dirty"`

Expected: fail for `Escape`; dirty protection may partially fail until creation clearing is inside the confirmed transition.

- [ ] **Step 3: Implement cancellation and confirm pending lifetime**

Add a `useEffect` that installs a `keydown` listener only while `pendingNodePlacement` is non-null. On `Escape`, call `onClearPendingNodePlacement`.

Ensure `onClearPendingNodePlacement` is called only inside the confirmed placement action, not before `runEditorTransition`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test src/features/graph-editor/GraphCanvas.test.tsx --test-name-pattern "pending|Escape|dirty"`

Expected: pass.

## Task 5: Full Verification

**Files:**
- No additional production changes.

- [ ] **Step 1: Run focused tests**

Run: `bun test src/features/graph-editor/NodePalette.test.tsx src/features/graph-editor/GraphCanvas.test.tsx src/App.test.tsx`

Expected: pass.

- [ ] **Step 2: Run full test and build**

Run: `bun test && bun run build && git status --short`

Expected: all tests pass, build succeeds, and git status shows only intentional uncommitted changes.
