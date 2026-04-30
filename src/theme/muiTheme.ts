import { createTheme } from "@mui/material/styles";

function hslCssVar(varName: string) {
  return `hsl(var(${varName}))`;
}

export const muiTheme = createTheme({
  palette: {
    mode: "light",
    primary: { main: hslCssVar("--primary"), contrastText: hslCssVar("--primary-foreground") },
    secondary: { main: hslCssVar("--secondary"), contrastText: hslCssVar("--secondary-foreground") },
    error: { main: hslCssVar("--destructive"), contrastText: hslCssVar("--destructive-foreground") },
    success: { main: hslCssVar("--success"), contrastText: hslCssVar("--success-foreground") },
    warning: { main: hslCssVar("--warning"), contrastText: hslCssVar("--warning-foreground") },
    info: { main: hslCssVar("--info"), contrastText: hslCssVar("--info-foreground") },
    background: { default: hslCssVar("--background"), paper: hslCssVar("--card") },
    text: { primary: hslCssVar("--foreground"), secondary: hslCssVar("--muted-foreground") },
    divider: hslCssVar("--border"),
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily: "Inter, system-ui, sans-serif",
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundColor: hslCssVar("--background"),
          color: hslCssVar("--foreground"),
        },
      },
    },
  },
});

