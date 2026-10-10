/// The seed a simulation starts from. Given the same seed and input, a
/// simulation comes out the same on every platform, every time.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Seed(pub u64);

/// xoshiro256** — small, fast, and fully specified, so its sequence does not
/// depend on any library's version. Immutable: drawing returns the value and
/// the generator to draw the next one from.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Rng {
    state: [u64; 4],
}

/// `SplitMix64`, the recommended way to spread one seed over the state of xoshiro.
fn split_mix(value: u64) -> (u64, u64) {
    let next = value.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mixed = (next ^ (next >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    let mixed = (mixed ^ (mixed >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    (mixed ^ (mixed >> 31), next)
}

impl Rng {
    pub fn from_seed(seed: Seed) -> Self {
        let (a, after_a) = split_mix(seed.0);
        let (b, after_b) = split_mix(after_a);
        let (c, after_c) = split_mix(after_b);
        let (d, _) = split_mix(after_c);
        Self {
            state: [a, b, c, d],
        }
    }

    /// The generator as four words, for carrying across a chunk boundary.
    pub fn state(self) -> [u64; 4] {
        self.state
    }

    /// A generator resumed from `state`. An all-zero state is the one state
    /// xoshiro cannot leave, so it is not accepted.
    pub fn from_state(state: [u64; 4]) -> Option<Self> {
        (state != [0; 4]).then_some(Self { state })
    }

    #[must_use]
    pub fn next_u64(self) -> (u64, Self) {
        let [s0, s1, s2, s3] = self.state;
        let result = s1.wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = s1 << 17;
        let s2 = s2 ^ s0;
        let s3 = s3 ^ s1;
        let s1 = s1 ^ s2;
        let s0 = s0 ^ s3;
        let s2 = s2 ^ t;
        let s3 = s3.rotate_left(45);
        (
            result,
            Self {
                state: [s0, s1, s2, s3],
            },
        )
    }

    /// A uniform draw in `[0, 1)`, from the top 53 bits.
    #[must_use]
    pub fn next_unit(self) -> (f64, Self) {
        let (bits, next) = self.next_u64();
        #[allow(clippy::cast_precision_loss)]
        let unit = (bits >> 11) as f64 / (1u64 << 53) as f64;
        (unit, next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_same_seed_draws_the_same_sequence() {
        let draw = |seed| {
            (0..5)
                .scan(Rng::from_seed(Seed(seed)), |rng, _| {
                    let (value, next) = rng.next_u64();
                    *rng = next;
                    Some(value)
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(draw(42), draw(42));
        assert_ne!(draw(42), draw(43));
    }

    #[test]
    fn units_stay_in_the_half_open_interval() {
        let units = (0..10_000).scan(Rng::from_seed(Seed(7)), |rng, _| {
            let (unit, next) = rng.next_unit();
            *rng = next;
            Some(unit)
        });
        assert!(units.into_iter().all(|unit| (0.0..1.0).contains(&unit)));
    }

    #[test]
    fn a_resumed_generator_continues_where_it_stopped() {
        let (_, after_one) = Rng::from_seed(Seed(1)).next_u64();
        let resumed = Rng::from_state(after_one.state());
        assert_eq!(
            resumed.map(|rng| rng.next_u64().0),
            Some(after_one.next_u64().0)
        );
        assert_eq!(Rng::from_state([0; 4]), None);
    }
}
