/// The shape a spec is written in: its entities, a table per component and
/// its resources. A spec says which in `v`, so an engine met with one from
/// a later version refuses it by that number rather than misread it. A
/// component added is no new version — a table an engine does not know is
/// refused by its name — only a change to the shape itself is.
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
/// Shape 3 gives each mode of an AT machine its own AT間天井; shape 2 gave the
/// machine one, which every mode is read to have.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct SchemaVersion(u32);

impl SchemaVersion {
    pub const CURRENT: Self = Self(3);

    /// The first shape in which each mode of an AT machine holds its own AT間天井.
    pub const AT_CEILING_BY_MODE: Self = Self(3);

    pub fn new(version: u32) -> Self {
        Self(version)
    }

    pub fn get(self) -> u32 {
        self.0
    }
}

/// The engine that solved a figure, kept beside it so a stored figure says
/// which arithmetic made it.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct EngineVersion(u32);

impl EngineVersion {
    pub const CURRENT: Self = Self(2);

    pub fn get(self) -> u32 {
        self.0
    }
}
