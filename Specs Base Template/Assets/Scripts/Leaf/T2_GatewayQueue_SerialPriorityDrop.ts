/**
 * Tier 2 — GatewayQueue: exactly one in flight, priority reorders the queue,
 * a user request drops queued background work, an in-flight job is never
 * interrupted.
 *
 * The queue is a LIVE singleton shared with the Lens (TTS warm-ups ride it,
 * and a scene reset re-queues them), so this test:
 *  - submits its whole batch SYNCHRONOUSLY in one tick, so the jobs' queue
 *    positions are decided before any of them can finish;
 *  - asserts only RELATIVE order among its own jobs — foreign jobs may
 *    interleave freely;
 *  - never holds a job open, so the queue's own stall guard cannot fire on a
 *    test fixture (the first draft held a blocker and was stalled out).
 */
import { Scenario } from "Leaf.lspkg/Scenarios/scenario/Scenario";
import { expect } from "Leaf.lspkg/Utils/common/Expect";
import { sleep } from "Leaf.lspkg/Utils/common/Utils";
import {
  GW_BACKGROUND,
  GW_NARRATION,
  GW_USER,
  gatewayDropPending,
  gatewaySubmit,
  gatewayWasDropped,
} from "../Engine/GatewayQueue";

@component
export class T2_GatewayQueue_SerialPriorityDrop extends Scenario {
  async run(): Promise<void> {
    const dispatched: string[] = [];
    const note = (label: string) => () => {
      dispatched.push(label);
    };
    const instant = () => Promise.resolve();

    // --- priority ordering: submit all four in ONE tick ------------------
    const bg1 = gatewaySubmit<void>({ label: "leaf:bg1", priority: GW_BACKGROUND, onDispatch: note("leaf:bg1"), run: instant });
    const bg2 = gatewaySubmit<void>({ label: "leaf:bg2", priority: GW_BACKGROUND, onDispatch: note("leaf:bg2"), run: instant });
    const narr = gatewaySubmit<void>({ label: "leaf:narr", priority: GW_NARRATION, onDispatch: note("leaf:narr"), run: instant });
    const user = gatewaySubmit<void>({ label: "leaf:user", priority: GW_USER, onDispatch: note("leaf:user"), run: instant });
    await Promise.all([bg1, bg2, narr, user]);

    const at = (l: string) => dispatched.indexOf(l);
    expect(at("leaf:user") >= 0).toBe(true);
    expect(at("leaf:narr") >= 0).toBe(true);
    // Exactly one in flight means dispatches are strictly serial, so order is
    // total. bg1 may have grabbed the slot before the rest were queued (it
    // was submitted first into a possibly idle queue); everything QUEUED is
    // dispatched by priority: user before narration before background, and
    // FIFO within a tier.
    expect(at("leaf:user") < at("leaf:narr")).toBe(true);
    expect(at("leaf:narr") < at("leaf:bg2")).toBe(true);
    expect(at("leaf:bg1") < at("leaf:bg2")).toBe(true);

    // --- drop: user work survives, queued background dies ----------------
    // Submit and drop in the SAME tick: nothing has left the queue yet
    // except whatever took the free slot.
    const keepUser = gatewaySubmit<string>({ label: "leaf:keepUser", priority: GW_USER, run: () => Promise.resolve("kept") });
    const doomedA = gatewaySubmit<void>({ label: "leaf:doomedA", priority: GW_BACKGROUND, run: instant });
    const doomedB = gatewaySubmit<void>({ label: "leaf:doomedB", priority: GW_BACKGROUND, run: instant });
    const droppedCount = gatewayDropPending(GW_BACKGROUND, "leaf test");

    // Both queued background jobs died; anything in flight (keepUser, or a
    // foreign job with keepUser queued at priority 0) was never touched.
    expect(droppedCount).toBeGreaterThan(1);
    let caughtA = false;
    let caughtB = false;
    await doomedA.catch((e) => (caughtA = gatewayWasDropped(e)));
    await doomedB.catch((e) => (caughtB = gatewayWasDropped(e)));
    expect(caughtA).toBe(true);
    expect(caughtB).toBe(true);
    expect(await keepUser).toBe("kept");

    await sleep(100);
  }
}
