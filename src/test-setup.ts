// Tests are deterministic: every test starts from the same pseudo-random
// sequence, so whole-season simulations (which draw fresh seeds) give the
// same results on every run and in CI.
import { beforeEach } from 'vitest';

beforeEach(() => {
  let state = 0x2545f491;
  Math.random = () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
});
