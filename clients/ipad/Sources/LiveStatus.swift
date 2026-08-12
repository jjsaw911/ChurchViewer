import Foundation

/// What the page says is on the screen, so the native buttons can show it.
///
/// The buttons along the bottom are native and the state they act on lives in
/// the page, which means without this they are three shapes that never change
/// however the morning is going. A button that looks identical whether or not
/// the press landed is a button somebody presses twice.
struct LiveStatus: Equatable {
    var blank = false
    var playing = false
    /// Whether what's on screen has a recording, so Play means anything at all.
    var canPlay = false
}
