# Typography contract

The user revoked the three-size / all-bold design. Preserve original weights (including non-bold text), styles and body/button sizes. Force the font family to Microsoft YaHei. The subsequent approved responsive layout allows bounded heading sizes at narrow widths. Keep responsive typography in typography.css and layout in responsive.css. Portal navigation becomes a drawer below 1024px.

Keep typography declarations in src/typography.css. Components reference classes rather than inline font settings. Do not reintroduce type-1/type-2/type-3 or a global weight override. Preserve all optimized images.

Run npm run test:typography and npm run build after typography changes.
