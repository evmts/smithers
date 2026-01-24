const std = @import("std");
const DefaultRenderer = @import("renderer.zig").DefaultRenderer;
const db = @import("../db.zig");
const logo = @import("../components/logo.zig");
const Input = @import("../components/input.zig").Input;
const ChatHistory = @import("../components/chat_history.zig").ChatHistory;
const Header = @import("../ui/header.zig").Header;
const StatusBar = @import("../ui/status.zig").StatusBar;
const Layout = @import("../layout.zig").Layout;
const loading_mod = @import("../loading.zig");
const KeyHandler = @import("../keys/handler.zig").KeyHandler;

pub const FrameRenderer = struct {
    pub const RenderContext = struct {
        header: *const Header,
        chat_history: *ChatHistory,
        input: *Input,
        status_bar: *StatusBar,
        database: *db.DefaultDatabase,
        loading: *const loading_mod.LoadingState,
        key_handler: *const KeyHandler,
    };

    pub fn render(win: DefaultRenderer.Window, ctx: *RenderContext) void {
        win.clear();

        const height = win.height;

        const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
        const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
        const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
        const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;

        const header_win = win.child(.{
            .x_off = 0,
            .y_off = 0,
            .width = win.width,
            .height = Layout.HEADER_HEIGHT,
        });
        ctx.header.draw(header_win, ctx.database);

        if (ctx.chat_history.hasConversation() or ctx.loading.is_loading) {
            const chat_win = win.child(.{
                .x_off = 0,
                .y_off = Layout.HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            ctx.chat_history.draw(chat_win);
        } else {
            const content_win = win.child(.{
                .x_off = 0,
                .y_off = Layout.HEADER_HEIGHT,
                .width = win.width,
                .height = chat_height,
            });
            logo.draw(content_win);
        }

        const now = std.time.milliTimestamp();
        if (ctx.loading.is_loading) {
            ctx.status_bar.setCustomStatus(" Smithers is thinking...");
        } else if (now - ctx.key_handler.last_ctrl_c < 1500 and ctx.key_handler.last_ctrl_c > 0) {
            ctx.status_bar.setCustomStatus(" Press Ctrl+C again to exit, or Ctrl+D");
        } else {
            ctx.status_bar.setCustomStatus(null);
        }

        const actual_status_height = ctx.status_bar.getHeight();
        const status_win = win.child(.{
            .x_off = 0,
            .y_off = if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y,
            .width = win.width,
            .height = actual_status_height,
        });
        ctx.status_bar.draw(status_win);

        const input_win = win.child(.{
            .x_off = 0,
            .y_off = input_y,
            .width = win.width,
            .height = Layout.INPUT_HEIGHT,
        });
        ctx.input.drawInWindow(input_win);
    }
};
