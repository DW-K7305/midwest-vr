use serde::{Serialize, Serializer};

/// All errors crossing the Tauri IPC boundary serialize to a tagged JSON object
/// the frontend can show in toasts and inline banners.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("adb not found at {0}")]
    AdbMissing(String),

    #[error("adb exited with status {code:?}: {stderr}")]
    AdbFailed { code: Option<i32>, stderr: String },

    #[error("device {0} is offline or unauthorized")]
    DeviceOffline(String),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("parse error: {0}")]
    Parse(String),

    #[error("config error: {0}")]
    Config(String),

    #[error(transparent)]
    Other(#[from] anyhow::Error),
}

impl Serialize for AppError {
    fn serialize<S>(&self, s: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        // Frontend gets a `{ kind, message }` object — easy to switch on.
        use serde::ser::SerializeStruct;
        let kind = match self {
            AppError::AdbMissing(_) => "AdbMissing",
            AppError::AdbFailed { .. } => "AdbFailed",
            AppError::DeviceOffline(_) => "DeviceOffline",
            AppError::Io(_) => "Io",
            AppError::Parse(_) => "Parse",
            AppError::Config(_) => "Config",
            AppError::Other(_) => "Other",
        };
        let mut st = s.serialize_struct("AppError", 2)?;
        st.serialize_field("kind", kind)?;
        st.serialize_field("message", &self.to_string())?;
        st.end()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
