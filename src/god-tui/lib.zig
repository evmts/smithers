// God-TUI: Production Terminal UI Framework
// Language-agnostic spec implementation in Zig
// Based on pi-mono reverse-engineering (~9k LOC TUI framework)

// Phase 1: Terminal Abstraction Layer
pub const terminal = @import("terminal/terminal.zig");
pub const ansi = @import("terminal/ansi.zig");
pub const stdin_buffer = @import("terminal/stdin_buffer.zig");
pub const keys = @import("terminal/keys.zig");

// Phase 2: Rendering Engine
pub const width = @import("rendering/width.zig");
pub const renderer = @import("rendering/renderer.zig");

// Phase 3: Component System
pub const Component = @import("components/component.zig").Component;
pub const Focusable = @import("components/component.zig").Focusable;
pub const Container = @import("components/component.zig").Container;
pub const Text = @import("components/text.zig").Text;
pub const TextStyle = @import("components/text.zig").TextStyle;
pub const Box = @import("components/box.zig").Box;
pub const BoxStyle = @import("components/box.zig").BoxStyle;
pub const BorderStyle = @import("components/box.zig").BorderStyle;
pub const Loader = @import("components/loader.zig").Loader;
pub const LoaderStyle = @import("components/loader.zig").LoaderStyle;
pub const SelectList = @import("components/select_list.zig").SelectList;
pub const SelectListStyle = @import("components/select_list.zig").SelectListStyle;

// Phase 4: Text Editor
pub const Editor = @import("editor/editor.zig").Editor;
pub const KillRing = @import("editor/kill_ring.zig").KillRing;
pub const UndoStack = @import("editor/undo.zig").UndoStack;

// Phase 5: Overlay System
pub const overlay = @import("overlay/overlay.zig");
pub const OverlayStack = overlay.OverlayStack;
pub const OverlayEntry = overlay.OverlayEntry;
pub const OverlayOptions = overlay.OverlayOptions;
pub const OverlayAnchor = overlay.OverlayAnchor;
pub const OverlayMargin = overlay.OverlayMargin;
pub const ResolvedLayout = overlay.ResolvedLayout;
pub const SizeValue = overlay.SizeValue;

// Phase 6: AI Providers
pub const ai = @import("ai/provider.zig");
pub const ProviderInterface = ai.ProviderInterface;
pub const Context = ai.Context;
pub const StreamEvent = ai.StreamEvent;
pub const ThinkingLevel = ai.ThinkingLevel;

// Phase 7: Extension System
pub const extensions = @import("extensions/extension.zig");
pub const ExtensionAPI = extensions.ExtensionAPI;
pub const ExtensionRunner = extensions.ExtensionRunner;
pub const EventBus = extensions.EventBus;

// Phase 8: Session Management
pub const session = @import("session/session.zig");
pub const Session = session.Session;
pub const SessionManager = session.SessionManager;

// Component modules
pub const components = struct {
    pub const component = @import("components/component.zig");
    pub const text = @import("components/text.zig");
    pub const box = @import("components/box.zig");
    pub const loader = @import("components/loader.zig");
    pub const select_list = @import("components/select_list.zig");
};

// Editor modules
pub const editor = struct {
    pub const core = @import("editor/editor.zig");
    pub const kill_ring = @import("editor/kill_ring.zig");
    pub const undo = @import("editor/undo.zig");
};

test {
    @import("std").testing.refAllDecls(@This());
}
