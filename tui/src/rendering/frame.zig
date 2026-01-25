const std = @import("std");
const renderer_mod = @import("renderer.zig");
const db = @import("../db.zig");
const logo = @import("../components/logo.zig");
const input_mod = @import("../components/input.zig");
const chat_history_mod = @import("../components/chat_history.zig");
const header_mod = @import("../ui/header.zig");
const status_mod = @import("../ui/status.zig");
const Layout = @import("../layout.zig").Layout;
const key_handler_mod = @import("../keys/handler.zig");

/// FrameRenderer generic over Renderer, Loading, Database, and EventLoop types
pub fn FrameRenderer(comptime R: type, comptime Loading: type, comptime Db: type, comptime EvLoop: type) type {
    const Input = input_mod.Input(R);
    const ChatHistory = chat_history_mod.ChatHistory(R);
    const Header = header_mod.Header(R);
    const StatusBar = status_mod.StatusBar(R);
    const KeyHandler = key_handler_mod.KeyHandler(R, Loading, Db, EvLoop);
    const Logo = logo.Logo(R);

    return struct {
        pub const RenderContext = struct {
            header: *const Header,
            chat_history: *ChatHistory,
            input: *Input,
            status_bar: *StatusBar,
            database: *Db,
            loading: *const Loading,
            key_handler: *const KeyHandler,
        };

        pub fn render(renderer: R, ctx: *RenderContext) void {
            renderer.clear();

            const height = renderer.height();

            const chrome_height = Layout.HEADER_HEIGHT + Layout.INPUT_HEIGHT + Layout.STATUS_HEIGHT;
            const chat_height: u16 = if (height > chrome_height) height - chrome_height else 1;
            const input_y: u16 = Layout.HEADER_HEIGHT + chat_height;
            const status_bar_y: u16 = input_y + Layout.INPUT_HEIGHT;

            const header_renderer = renderer.subRegion(0, 0, renderer.width(), Layout.HEADER_HEIGHT);
            ctx.header.draw(header_renderer, ctx.database);

            if (ctx.chat_history.hasConversation() or ctx.loading.isLoading()) {
                const chat_renderer = renderer.subRegion(0, Layout.HEADER_HEIGHT, renderer.width(), chat_height);
                ctx.chat_history.draw(chat_renderer);
            } else {
                const content_renderer = renderer.subRegion(0, Layout.HEADER_HEIGHT, renderer.width(), chat_height);
                Logo.draw(content_renderer);
            }

            const now = std.time.milliTimestamp();
            if (ctx.loading.isLoading()) {
                ctx.status_bar.setCustomStatus(" Smithers is thinking...");
            } else if (now - ctx.key_handler.last_ctrl_c < 1500 and ctx.key_handler.last_ctrl_c > 0) {
                ctx.status_bar.setCustomStatus(" Press Ctrl+C again to exit, or Ctrl+D");
            } else {
                ctx.status_bar.setCustomStatus(null);
            }

            const actual_status_height = ctx.status_bar.getHeight();
            const status_renderer = renderer.subRegion(
                0,
                if (actual_status_height > 1) status_bar_y -| (actual_status_height - 1) else status_bar_y,
                renderer.width(),
                actual_status_height,
            );
            ctx.status_bar.draw(status_renderer);

            const input_renderer = renderer.subRegion(0, input_y, renderer.width(), Layout.INPUT_HEIGHT);
            ctx.input.drawInWindow(input_renderer);
        }
    };
}
