use crate::probability::BasisPoints;
use crate::setting_level::PerSettingLevel;

/// How a parlor is thought to spread its settings over a machine's cabinets:
/// the prior that what is seen at one cabinet updates. A share of zero rules
/// a setting out. The shares sum to exactly 100%, which the engine checks.
#[derive(Clone, Debug, PartialEq)]
pub struct Distribution(pub PerSettingLevel<BasisPoints>);
