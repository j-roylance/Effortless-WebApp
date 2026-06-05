export function buildVisionBreakdownPrompt(vision: string, progressSoFar: string): string {
  const visionText = vision.trim() || "(not provided)";
  const progressText = progressSoFar.trim() || "(nothing noted yet)";

  return `You are helping me break down a life vision into a chain of goals, working backward from the vision itself.

## My vision
${visionText}

## What I have done toward this vision so far
${progressText}

## Your task
Work with me in a back-and-forth dialogue. Start from my vision above and work **backward**, step by step:

1. Begin at the vision — treat it as the top of the chain.
2. Ask me questions and propose the **last goal** I would need to achieve immediately before the vision is realized (the step right below the vision).
3. Continue working backward: for each goal we identify, help me find the goal that comes **before** it, moving down the chain toward earlier, more foundational steps.
4. Keep going until we reach the **first, most easily achievable goal** — something small and concrete I could start on soon.
5. At each step, build on what I have already done (see above) so the chain fits my real situation.

Present goals one at a time in dialogue. Confirm each step with me before moving to the earlier goal. When we reach the first achievable goal, summarize the full chain from that first goal up to the vision.`;
}

export function buildGoalBreakdownPrompt(goal: string, progressSoFar: string): string {
  const goalText = goal.trim() || "(not provided)";
  const progressText = progressSoFar.trim() || "(nothing noted yet)";

  return `You are helping me break down a goal that feels too big into smaller, manageable sub-goals.

## The goal that feels too big
${goalText}

## What I have done toward this goal so far
${progressText}

## Your task
Work with me in a back-and-forth dialogue. Start from the big goal above and work **backward**:

1. Help me identify the step or sub-goal that comes **immediately before** achieving this goal.
2. For each sub-goal we identify, keep working backward — what would I need to achieve before *that*?
3. Continue breaking the goal into smaller and smaller pieces through dialogue.
4. **Do not stop** until I explicitly tell you that the goals feel small enough to act on.
5. At each step, account for what I have already done (see above).

Ask one focused question at a time. Propose sub-goals and check with me before going smaller. When I say the goals are small enough, give me a clear ordered list from the smallest first step up to the original goal.`;
}
