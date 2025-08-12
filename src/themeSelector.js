// themeSelector.js

const { GObject, Gtk, Gio, Adw } = imports.gi;

var ThemeSelector = GObject.registerClass(
  {
    GTypeName: "ThemeSelector",
  },
  class ThemeSelector extends Gtk.Box {
    _init() {
      super._init({
        orientation: Gtk.Orientation.HORIZONTAL,
        css_classes: ["linked"],
        halign: Gtk.Align.CENTER,
        margin_top: 6,
        margin_bottom: 6,
      });

      const settings = new Gio.Settings({
        schema_id: "com.example.WifiAnalyzer",
      });

      // Botão Padrão (Segue o sistema)
      const followButton = new Gtk.CheckButton({
        tooltip_text: "Seguir estilo do sistema",
      });
      const followIcon = new Gtk.Image({
        icon_name: "contrast-symbolic",
      });
      followButton.set_child(followIcon);
      followButton.connect("toggled", () => {
        if (followButton.active) settings.set_string("color-scheme", "default");
      });

      // Botão Claro
      const lightButton = new Gtk.CheckButton({
        tooltip_text: "Tema claro",
        group: followButton,
      });
      const lightIcon = new Gtk.Image({
        icon_name: "display-brightness-symbolic",
      });
      lightButton.set_child(lightIcon);
      lightButton.connect("toggled", () => {
        if (lightButton.active)
          settings.set_string("color-scheme", "force-light");
      });

      // Botão Escuro
      const darkButton = new Gtk.CheckButton({
        tooltip_text: "Tema escuro",
        group: followButton,
      });
      const darkIcon = new Gtk.Image({
        icon_name: "weather-clear-night-symbolic",
      });
      darkButton.set_child(darkIcon);
      darkButton.connect("toggled", () => {
        if (darkButton.active)
          settings.set_string("color-scheme", "force-dark");
      });

      // Sincronizar com as configurações atuais
      const updateButtons = () => {
        const scheme = settings.get_string("color-scheme");
        if (scheme === "force-light") lightButton.active = true;
        else if (scheme === "force-dark") darkButton.active = true;
        else followButton.active = true;
      };

      settings.connect("changed::color-scheme", updateButtons);
      updateButtons();

      this.append(followButton);
      this.append(lightButton);
      this.append(darkButton);
    }
  }
);
