use std::num::NonZeroU32;

/// A probability, `0 <= p <= 1`, finite. Only constructible through checks,
/// so a value of this type is never out of range.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct Probability(f64);

/// Why a number could not be a probability.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProbabilityError {
    NotFinite,
    OutOfRange,
}

impl Probability {
    /// # Errors
    /// When `value` is not finite or lies outside `0..=1`.
    pub fn new(value: f64) -> Result<Self, ProbabilityError> {
        if !value.is_finite() {
            Err(ProbabilityError::NotFinite)
        } else if (0.0..=1.0).contains(&value) {
            Ok(Self(value))
        } else {
            Err(ProbabilityError::OutOfRange)
        }
    }

    pub fn value(self) -> f64 {
        self.0
    }
}

/// Hundredths of a percent: `81.5%` is `8150`. Integral, so a distribution
/// summing to exactly 100% is checked exactly.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct BasisPoints(u32);

impl BasisPoints {
    pub const WHOLE: Self = Self(10_000);

    /// # Errors
    /// When above 100%.
    pub fn new(value: u32) -> Result<Self, ProbabilityError> {
        if value <= Self::WHOLE.0 {
            Ok(Self(value))
        } else {
            Err(ProbabilityError::OutOfRange)
        }
    }

    pub fn get(self) -> u32 {
        self.0
    }

    pub fn probability(self) -> Probability {
        Probability(f64::from(self.0) / f64::from(Self::WHOLE.0))
    }
}

/// A denominator as an analysis sheet prints it, in hundredths: `273.1` is `27310`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Denominator(NonZeroU32);

impl Denominator {
    pub fn from_hundredths(hundredths: NonZeroU32) -> Self {
        Self(hundredths)
    }

    pub fn hundredths(self) -> NonZeroU32 {
        self.0
    }
}

/// A probability as it was written: `1/273.1`, or `0.5%`. Kept in that form
/// so storing and showing it never goes through a rounded float.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ProbabilitySource {
    Ratio {
        numerator: u32,
        denominator: Denominator,
    },
    Percent(BasisPoints),
}

impl ProbabilitySource {
    /// # Errors
    /// When a ratio comes to more than one.
    pub fn probability(self) -> Result<Probability, ProbabilityError> {
        match self {
            Self::Ratio {
                numerator,
                denominator,
            } => Probability::new(
                f64::from(numerator) * 100.0 / f64::from(denominator.hundredths().get()),
            ),
            Self::Percent(points) => Ok(points.probability()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_values_outside_the_unit_interval() {
        assert_eq!(Probability::new(1.5), Err(ProbabilityError::OutOfRange));
        assert_eq!(Probability::new(-0.1), Err(ProbabilityError::OutOfRange));
        assert_eq!(Probability::new(f64::NAN), Err(ProbabilityError::NotFinite));
        assert!(Probability::new(1.0).is_ok());
    }

    #[test]
    fn reads_a_ratio_with_a_fractional_denominator() -> Result<(), ProbabilityError> {
        let denominator = Denominator::from_hundredths(
            NonZeroU32::new(27_310).ok_or(ProbabilityError::OutOfRange)?,
        );
        let p = ProbabilitySource::Ratio {
            numerator: 1,
            denominator,
        }
        .probability()?;
        assert!((p.value() - 1.0 / 273.1).abs() < 1e-15);
        Ok(())
    }

    #[test]
    fn a_ratio_above_one_is_refused() {
        let denominator = Denominator::from_hundredths(NonZeroU32::MIN);
        assert_eq!(
            ProbabilitySource::Ratio {
                numerator: 2,
                denominator
            }
            .probability(),
            Err(ProbabilityError::OutOfRange)
        );
    }
}
