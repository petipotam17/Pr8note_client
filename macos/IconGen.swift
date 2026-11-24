import AppKit

// Generates a 1024×1024 Pr8note app icon (rounded gradient tile + P + lime dot).
let size: CGFloat = 1024
let output = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-1024.png"

let image = NSImage(size: NSSize(width: size, height: size))
image.lockFocus()

guard let context = NSGraphicsContext.current?.cgContext else {
    FileHandle.standardError.write("Impossible d'ouvrir le contexte graphique.\n".data(using: .utf8)!)
    exit(1)
}

context.setAllowsAntialiasing(true)
context.setShouldAntialias(true)

let tileRect = NSRect(x: 32, y: 32, width: 960, height: 960)
let tile = NSBezierPath(roundedRect: tileRect, xRadius: 210, yRadius: 210)

context.saveGState()
tile.addClip()
let gradient = NSGradient(colorsAndLocations:
    (NSColor(srgbRed: 0.56, green: 0.48, blue: 1.00, alpha: 1.0), 0.0),
    (NSColor(srgbRed: 0.43, green: 0.37, blue: 0.99, alpha: 1.0), 0.55),
    (NSColor(srgbRed: 0.13, green: 0.83, blue: 0.93, alpha: 1.0), 1.0)
)!
gradient.draw(in: tile, angle: -48)
context.restoreGState()

// Subtle inner highlight.
NSColor(white: 1.0, alpha: 0.10).setStroke()
tile.lineWidth = 6
tile.stroke()

// White "P" using the rounded system font.
let baseFont = NSFont.systemFont(ofSize: 570, weight: .bold)
let roundedFont = baseFont.fontDescriptor.withDesign(.rounded).flatMap { NSFont(descriptor: $0, size: 570) } ?? baseFont
let paragraph = NSMutableParagraphStyle()
paragraph.alignment = .center
let attributes: [NSAttributedString.Key: Any] = [
    .font: roundedFont,
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph,
]
let glyph = NSAttributedString(string: "P", attributes: attributes)
let glyphSize = glyph.size()
glyph.draw(in: NSRect(x: 32, y: (size - glyphSize.height) / 2 + 44, width: size - 64, height: glyphSize.height))

// Lime signature dot.
NSColor(srgbRed: 0.79, green: 1.0, blue: 0.40, alpha: 1.0).setFill()
NSBezierPath(ovalIn: NSRect(x: 706, y: 232, width: 96, height: 96)).fill()

image.unlockFocus()

guard
    let tiff = image.tiffRepresentation,
    let bitmap = NSBitmapImageRep(data: tiff),
    let png = bitmap.representation(using: .png, properties: [:])
else {
    FileHandle.standardError.write("Impossible de produire le PNG.\n".data(using: .utf8)!)
    exit(1)
}

do {
    try png.write(to: URL(fileURLWithPath: output))
    print("Icône écrite : \(output)")
} catch {
    FileHandle.standardError.write("Erreur d'écriture : \(error)\n".data(using: .utf8)!)
    exit(1)
}
