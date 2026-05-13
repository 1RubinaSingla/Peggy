import type { Tier } from "./types.ts";

export const TIERS: Tier[] = [
  {
    name: "Certified Diamond",
    range: [0, 10],
    blurb: "you actually held. statistically this means you are rich, dead, or both. rare specimen. do not breed.",
  },
  {
    name: "Mostly Fine",
    range: [10, 100],
    blurb: "you sleep at night. you do not refresh dexscreener on the toilet. we don't trust you and we're not sure you're real.",
  },
  {
    name: "Mid-Curve Cope",
    range: [100, 1000],
    blurb: "you think you're a good trader. your sells look smart in isolation. they are, in fact, not.",
  },
  {
    name: "Serial Fumbler",
    range: [1000, 10_000],
    blurb: "you've fumbled a house. a normal house. with a yard. that you will not own. consider therapy or another wallet.",
  },
  {
    name: "Paperhand Emperor",
    range: [10_000, 100_000],
    blurb: "generational wealth, ejected like a disposable vape. please touch grass. you will not. you cannot. it is too late.",
  },
  {
    name: "Should've Just Bought Bonk",
    range: [100_000, Infinity],
    blurb: "we made a special tier for you. that is how bad it is. burn the wallet, change your name, move to a country with no chart.",
  },
];

export function assignTier(diamondCopeSol: number): Tier {
  return TIERS.find((t) => diamondCopeSol >= t.range[0] && diamondCopeSol < t.range[1])!;
}
