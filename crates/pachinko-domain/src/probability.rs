use std::num::NonZeroU32;

/// A probability, `0 <= p <= 1`, finite. Only constructible through checks,
/// so a value of this type is never out of range.
#[derive(Clone, Copy, Debug, PartialEq, PartialOrd)]
pub struct Probability(f64);

/// Why a number could not be a probability.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum ProbabilityError {
    NotFinite,
    OutOfRange,
}

impl Probability {
    pub const ZERO: Self = Self(0.0);
    pub const ONE: Self = Self(1.0);

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

    /// `1 - p`.
    #[must_use]
    pub fn complement(self) -> Self {
        Self((1.0 - self.0).clamp(0.0, 1.0))
    }

    /// Both of two independent events.
    #[must_use]
    pub fn and(self, other: Self) -> Self {
        Self((self.0 * other.0).clamp(0.0, 1.0))
    }

    /// At least one success in `trials` independent tries: `1 - (1 - p)^n`.
    #[must_use]
    pub fn at_least_once_in(self, trials: NonZeroU32) -> Self {
        let misses = self.complement().0.powf(f64::from(trials.get()));
        Self((1.0 - misses).clamp(0.0, 1.0))
    }

    pub fn is_certain(self) -> bool {
        self.0 >= 1.0
    }

    pub fn is_impossible(self) -> bool {
        self.0 <= 0.0
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

/// A denominator as a spec sheet prints it, in hundredths: `319.7` is `31970`.
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

/// A probability as it was written: `1/319.7`, or `81%`. Kept in that form
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

    fn close(left: f64, right: f64) -> bool {
        (left - right).abs() < 1e-12
    }

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
            NonZeroU32::new(31_970).ok_or(ProbabilityError::OutOfRange)?,
        );
        let p = ProbabilitySource::Ratio {
            numerator: 1,
            denominator,
        }
        .probability()?;
        assert!(close(p.value(), 1.0 / 319.7));
        Ok(())
    }

    #[test]
    fn a_limited_number_of_tries_compounds() -> Result<(), ProbabilityError> {
        let p = Probability::new(0.1)?;
        let three = NonZeroU32::new(3).ok_or(ProbabilityError::OutOfRange)?;
        assert!(close(
            p.at_least_once_in(three).value(),
            1.0 - 0.9_f64.powi(3)
        ));
        Ok(())
    }
}
