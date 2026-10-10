/// One of the settings a parlor chooses for a cabinet, `1` to `6`. A machine
/// may offer only some of them — `1, 2, 4, 5, 6` is common — so a spec lists
/// the ones it has rather than assuming all six.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SettingLevel(u8);

impl SettingLevel {
    pub const LOWEST: u8 = 1;
    pub const HIGHEST: u8 = 6;

    pub fn new(value: u8) -> Option<Self> {
        (Self::LOWEST..=Self::HIGHEST)
            .contains(&value)
            .then_some(Self(value))
    }

    pub fn get(self) -> u8 {
        self.0
    }
}

/// A value for each of a machine's settings, in the order written.
#[derive(Clone, Debug, PartialEq)]
pub struct PerSettingLevel<T>(pub Vec<(SettingLevel, T)>);

impl<T> PerSettingLevel<T> {
    pub fn get(&self, setting_level: SettingLevel) -> Option<&T> {
        self.0
            .iter()
            .find(|(each, _)| *each == setting_level)
            .map(|(_, value)| value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_to_six_is_a_setting() {
        assert_eq!(SettingLevel::new(0), None);
        assert_eq!(SettingLevel::new(7), None);
        assert_eq!(SettingLevel::new(6).map(SettingLevel::get), Some(6));
    }

    #[test]
    fn a_value_is_found_by_its_setting() {
        let values = PerSettingLevel(
            [1, 6]
                .into_iter()
                .filter_map(SettingLevel::new)
                .zip(["low", "high"])
                .collect(),
        );
        assert_eq!(
            SettingLevel::new(6).and_then(|six| values.get(six)),
            Some(&"high")
        );
        assert_eq!(
            SettingLevel::new(3).and_then(|three| values.get(three)),
            None
        );
    }
}
