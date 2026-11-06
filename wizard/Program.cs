using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Reflection;
using System.Text;
using System.Windows.Forms;

[assembly: AssemblyTitle("Aero Code 设置")]
[assembly: AssemblyProduct("Aero Code")]
[assembly: AssemblyCompany("Aero")]
[assembly: AssemblyDescription("Aero Code 首次配置：填写模型网关地址与密钥")]
[assembly: AssemblyVersion("1.0.0.0")]
[assembly: AssemblyFileVersion("1.0.0.0")]

namespace AeroCodeSetup
{
    internal static class Payload
    {
        private static string Read(string name)
        {
            using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(name))
            {
                if (stream == null) throw new InvalidOperationException("缺少内置资源：" + name);
                using (StreamReader reader = new StreamReader(stream, new UTF8Encoding(false)))
                {
                    return reader.ReadToEnd();
                }
            }
        }

        public static string ConfigTemplate()
        {
            return Read("config.template.json");
        }

        public static string Agents()
        {
            return Read("AGENTS.md");
        }

        public static string Skill(string id)
        {
            return Read("skill." + id + ".md");
        }

        public static readonly string[] SkillIDs = { "code-review", "java-standards", "legacy-migration" };

        public static string Theme()
        {
            return Read("theme.aero-code.json");
        }
    }

    internal static class Setup
    {
        public static string ConfigDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".config", "aero-code");
            }
        }

        public static string ConfigFile
        {
            get { return Path.Combine(ConfigDirectory, "aero-code.jsonc"); }
        }

        public static string NormalizeBaseURL(string value)
        {
            return (value ?? "").Trim().TrimEnd('/');
        }

        private static string JsonEscape(string value)
        {
            StringBuilder builder = new StringBuilder(value.Length + 16);
            foreach (char ch in value)
            {
                switch (ch)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (ch < ' ')
                        {
                            builder.Append("\\u").Append(((int)ch).ToString("x4"));
                        }
                        else
                        {
                            builder.Append(ch);
                        }
                        break;
                }
            }
            return builder.ToString();
        }

        private static void WriteText(string path, string content)
        {
            Directory.CreateDirectory(Path.GetDirectoryName(path));
            File.WriteAllText(path, content, new UTF8Encoding(false));
        }

        /// <summary>写入用户级配置与配套资源，返回写入的配置文件路径。</summary>
        public static string Save(string baseURL, string apiKey, string modelID, string modelName)
        {
            string url = NormalizeBaseURL(baseURL);
            string id = (modelID ?? "").Trim();
            string name = (modelName ?? "").Trim();
            if (name.Length == 0) name = id;

            Directory.CreateDirectory(ConfigDirectory);

            if (File.Exists(ConfigFile))
            {
                string stamp = DateTime.Now.ToString("yyyyMMddHHmmss");
                File.Copy(ConfigFile, ConfigFile + ".bak." + stamp, true);
            }

            string json = Payload.ConfigTemplate()
                .Replace("__BASE_URL__", JsonEscape(url))
                .Replace("__API_KEY__", JsonEscape((apiKey ?? "").Trim()))
                .Replace("__MODEL_ID__", JsonEscape(id))
                .Replace("__MODEL_NAME__", JsonEscape(name));

            WriteText(ConfigFile, json);

            WriteText(Path.Combine(ConfigDirectory, "AGENTS.md"), Payload.Agents());
            foreach (string skill in Payload.SkillIDs)
            {
                WriteText(Path.Combine(ConfigDirectory, "skills", skill, "SKILL.md"), Payload.Skill(skill));
            }
            WriteText(Path.Combine(ConfigDirectory, "themes", "aero-code.json"), Payload.Theme());

            return ConfigFile;
        }

        /// <summary>探测网关是否可达：GET {baseURL}/models。</summary>
        public static string Probe(string baseURL, string apiKey)
        {
            string url = NormalizeBaseURL(baseURL) + "/models";
            HttpWebRequest request = (HttpWebRequest)WebRequest.Create(url);
            request.Method = "GET";
            request.Timeout = 15000;
            request.ReadWriteTimeout = 15000;
            request.UserAgent = "AeroCodeSetup/1.0";
            if (!string.IsNullOrEmpty(apiKey)) request.Headers["Authorization"] = "Bearer " + apiKey.Trim();

            try
            {
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                {
                    string body = reader.ReadToEnd();
                    if (body.Length > 240) body = body.Substring(0, 240) + "…";
                    return string.Format("HTTP {0}，响应片段：{1}", (int)response.StatusCode, body);
                }
            }
            catch (WebException error)
            {
                if (error.Response != null)
                {
                    using (HttpWebResponse response = (HttpWebResponse)error.Response)
                    using (StreamReader reader = new StreamReader(response.GetResponseStream()))
                    {
                        string body = reader.ReadToEnd();
                        if (body.Length > 240) body = body.Substring(0, 240) + "…";
                        return string.Format("HTTP {0}（地址可达，但请求被拒绝）：{1}", (int)response.StatusCode, body);
                    }
                }
                throw;
            }
        }

        /// <summary>启动已安装的客户端；找不到时返回 null。</summary>
        public static string FindApp()
        {
            List<string> candidates = new List<string>();
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            candidates.Add(Path.GetFullPath(Path.Combine(baseDir, "..", "Aero Code.exe")));
            candidates.Add(Path.Combine(baseDir, "Aero Code.exe"));

            string programs = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs");
            candidates.Add(Path.Combine(programs, "aero-code", "Aero Code.exe"));
            candidates.Add(Path.Combine(programs, "Aero Code", "Aero Code.exe"));

            foreach (string candidate in candidates)
            {
                if (File.Exists(candidate)) return candidate;
            }

            if (Directory.Exists(programs))
            {
                foreach (string directory in Directory.GetDirectories(programs))
                {
                    string candidate = Path.Combine(directory, "Aero Code.exe");
                    if (File.Exists(candidate)) return candidate;
                }
            }

            return null;
        }
    }

    internal sealed class SetupForm : Form
    {
        private readonly TextBox urlBox = new TextBox();
        private readonly TextBox keyBox = new TextBox();
        private readonly TextBox modelBox = new TextBox();
        private readonly Label status = new Label();

        public SetupForm()
        {
            Text = "Aero Code 设置";
            FormBorderStyle = FormBorderStyle.FixedDialog;
            StartPosition = FormStartPosition.CenterScreen;
            MaximizeBox = false;
            MinimizeBox = false;
            ClientSize = new Size(600, 330);
            Font = new Font("Microsoft YaHei UI", 9F, FontStyle.Regular, GraphicsUnit.Point);

            AddLabel("填写模型网关地址与密钥，保存后会自动启动 Aero Code。", 20, 16, 560, 20, true);

            AddLabel("网关地址（Base URL）", 20, 52, 240, 20, false);
            urlBox.SetBounds(20, 74, 560, 26);
            urlBox.Text = "https://";
            Controls.Add(urlBox);

            AddLabel("API Key", 20, 110, 240, 20, false);
            keyBox.SetBounds(20, 132, 560, 26);
            keyBox.UseSystemPasswordChar = true;
            Controls.Add(keyBox);

            AddLabel("模型 ID（网关上的真实模型名）", 20, 168, 300, 20, false);
            modelBox.SetBounds(20, 190, 560, 26);
            modelBox.Text = "gpt-4o-mini";
            Controls.Add(modelBox);

            Button probe = new Button();
            probe.Text = "测试连接";
            probe.SetBounds(20, 234, 110, 32);
            probe.Click += OnProbe;
            Controls.Add(probe);

            Button save = new Button();
            save.Text = "保存并启动";
            save.SetBounds(400, 234, 120, 32);
            save.Click += OnSave;
            Controls.Add(save);

            Button cancel = new Button();
            cancel.Text = "取消";
            cancel.SetBounds(530, 234, 50, 32);
            cancel.Click += delegate { Close(); };
            Controls.Add(cancel);

            AcceptButton = save;
            CancelButton = cancel;

            status.SetBounds(20, 276, 560, 40);
            status.AutoSize = false;
            status.ForeColor = Color.DimGray;
            status.Text = "配置将写入：" + Setup.ConfigFile;
            Controls.Add(status);
        }

        private void AddLabel(string text, int x, int y, int width, int height, bool bold)
        {
            Label label = new Label();
            label.Text = text;
            label.SetBounds(x, y, width, height);
            label.AutoSize = false;
            if (bold) label.Font = new Font(Font, FontStyle.Bold);
            Controls.Add(label);
        }

        private bool ValidateInput()
        {
            string url = Setup.NormalizeBaseURL(urlBox.Text);
            if (url.Length == 0 || !url.StartsWith("http", StringComparison.OrdinalIgnoreCase))
            {
                MessageBox.Show(this, "请填写以 http:// 或 https:// 开头的网关地址。", "地址不合法",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                urlBox.Focus();
                return false;
            }
            if (modelBox.Text.Trim().Length == 0)
            {
                MessageBox.Show(this, "请填写模型 ID（例如 gpt-4o-mini）。", "缺少模型",
                    MessageBoxButtons.OK, MessageBoxIcon.Warning);
                modelBox.Focus();
                return false;
            }
            return true;
        }

        private void OnProbe(object sender, EventArgs e)
        {
            if (!ValidateInput()) return;
            status.ForeColor = Color.DimGray;
            status.Text = "正在连接 " + Setup.NormalizeBaseURL(urlBox.Text) + " …";
            Application.DoEvents();
            try
            {
                status.Text = Setup.Probe(urlBox.Text, keyBox.Text);
            }
            catch (Exception error)
            {
                status.ForeColor = Color.Firebrick;
                status.Text = "连接失败：" + error.Message;
            }
        }

        private void OnSave(object sender, EventArgs e)
        {
            if (!ValidateInput()) return;
            try
            {
                string path = Setup.Save(urlBox.Text, keyBox.Text, modelBox.Text, modelBox.Text);
                string app = Setup.FindApp();
                if (app == null)
                {
                    MessageBox.Show(this,
                        "配置已保存到：\n" + path + "\n\n没有找到已安装的 Aero Code，请手动启动客户端。",
                        "已保存", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    Close();
                    return;
                }
                Process.Start(new ProcessStartInfo(app) { UseShellExecute = true });
                Close();
            }
            catch (Exception error)
            {
                MessageBox.Show(this, "保存失败：" + error.Message, "出错",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
    }

    internal static class Program
    {
        [STAThread]
        private static void Main(string[] args)
        {
            // 无界面写入，供自动化验证使用：
            //   AeroCodeSetup.exe --write <baseURL> <apiKey> <modelID>
            if (args.Length >= 4 && args[0] == "--write")
            {
                string path = Setup.Save(args[1], args[2], args[3], args[3]);
                Console.WriteLine(path);
                return;
            }

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new SetupForm());
        }
    }
}
