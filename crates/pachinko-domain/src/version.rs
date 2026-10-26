/// The shape a spec is written in: its entities, a table per component and
/// its resources. A spec says which in `v`, and an engine reads the one
/// shape it knows: a spec in any other version, later or earlier, is
/// refused by that number rather than misread. A component added is no new
/// version — a table an engine does not know is refused by its name — only
/// a change to the shape itself is.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SpecVersion(u32);

impl SpecVersion {
    pub const CURRENT: Self = Self(1);

    pub fn get(self) -> u32 {
        self.0
    }
}

/// The shape of a normalised spec. A stored spec says which shape it is in,
/// so a later engine reads it as it was meant rather than as it now would be.
/// 3: a state may say the spins it plays at the heso, and a miss the spins
///    it fills the relief gauge by — a 時短 ended early — which an engine
///    reading 2 would pass over.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SchemaVersion(u32);

impl SchemaVersion {
    pub const CURRENT: Self = Self(3);

    pub fn new(version: u32) -> Self {
        Self(version)
    }

    pub fn get(self) -> u32 {
        self.0
    }
}
