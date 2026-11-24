
const config = window.CAMPUS_CONFIG;
const hasBackend = Boolean(
  config.SUPABASE_URL &&
  config.SUPABASE_KEY &&
  !config.SUPABASE_URL.includes("YOUR_") &&
  !config.SUPABASE_KEY.includes("YOUR_")
);

const db = hasBackend
  ? window.supabase.createClient(config.SUPABASE_URL, config.SUPABASE_KEY)
  : null;

const demoNotes = [
  {
    id: "demo-1",
    title: "Digital Electronics - Unit 1",
    subject: "Digital Electronics",
    semester: 3,
    type: "Notes",
    author: "CampusNotes Team",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    status: "approved"
  },
  {
    id: "demo-2",
    title: "Engineering Mathematics",
    subject: "Mathematics",
    semester: 1,
    type: "Notes",
    author: "CampusNotes Team",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    status: "approved"
  },
  {
    id: "demo-3",
    title: "Electronic Devices Question Paper",
    subject: "Electronic Devices",
    semester: 3,
    type: "Question Paper",
    author: "CampusNotes Team",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    status: "approved"
  },
  {
    id: "demo-4",
    title: "Physics Laboratory",
    subject: "Engineering Physics",
    semester: 2,
    type: "Lab",
    author: "CampusNotes Team",
    url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
    status: "approved"
  }
];

let resources = [...demoNotes];

const grid = document.getElementById("resourceGrid");
const search = document.getElementById("searchInput");
const semester = document.getElementById("semesterFilter");
const type = document.getElementById("typeFilter");

const escapeHTML = value => String(value ?? "").replace(
  /[&<>"']/g,
  char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]
);

async function loadResources() {
  if (db) {
    const { data, error } = await db
      .from("resources")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      grid.innerHTML = "<p>Unable to load resources.</p>";
      return;
    }

    resources = data || [];
  } else {
    const submissions = JSON.parse(
      localStorage.getItem("campusnotes_demo") || "[]"
    );

    resources = [
      ...demoNotes,
      ...submissions.filter(item => item.status === "approved")
    ];
  }

  renderResources();
}

function renderResources() {
  const query = search.value.toLowerCase().trim();
  const sem = semester.value;
  const category = type.value;

  const filtered = resources.filter(item => {
    const matchesSearch = [
      item.title, item.subject, item.author, item.type
    ].some(value => String(value || "").toLowerCase().includes(query));

    const matchesSemester =
      sem === "all" || String(item.semester) === sem;

    const matchesType =
      category === "all" || item.type === category;

    return matchesSearch && matchesSemester && matchesType;
  });

  document.getElementById("totalCount").textContent = resources.length;

  grid.innerHTML = filtered.map(item => `
    <article class="resource-card">
      <div class="file-icon">📄</div>
      <span class="tag">${escapeHTML(item.type)}</span>
      <span class="tag">Semester ${escapeHTML(item.semester)}</span>
      <h3>${escapeHTML(item.title)}</h3>
      <p>Subject: ${escapeHTML(item.subject)}</p>
      <p>Shared by: ${escapeHTML(item.author)}</p>
      <div class="card-actions">
        <button type="button" data-preview="${escapeHTML(item.id)}">
          Preview
        </button>
        <a class="download"
          href="${escapeHTML(item.url)}"
          target="_blank"
          rel="noopener noreferrer">Open PDF ↗</a>
      </div>
    </article>
  `).join("");

  document.getElementById("emptyMessage").hidden = filtered.length > 0;
}

search.addEventListener("input", renderResources);
semester.addEventListener("change", renderResources);
type.addEventListener("change", renderResources);

grid.addEventListener("click", event => {
  const button = event.target.closest("[data-preview]");
  if (!button) return;

  const item = resources.find(
    resource => String(resource.id) === button.dataset.preview
  );

  if (item?.url) window.open(item.url, "_blank", "noopener,noreferrer");
});

// Theme switch
document.getElementById("themeBtn").addEventListener("click", () => {
  const dark = document.documentElement.dataset.theme !== "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  localStorage.setItem("campusnotes_theme", dark ? "dark" : "light");
});

const savedTheme = localStorage.getItem("campusnotes_theme");
if (savedTheme) document.documentElement.dataset.theme = savedTheme;

// Authentication
const authDialog = document.getElementById("authDialog");

document.getElementById("loginBtn").addEventListener("click", () => {
  authDialog.showModal();
});

document.getElementById("closeAuth").addEventListener("click", () => {
  authDialog.close();
});

document.getElementById("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const form = new FormData(event.currentTarget);
  const email = form.get("email");
  const password = form.get("password");
  const message = document.getElementById("authMessage");

  if (!db) {
    message.textContent = "Configure Supabase to enable real accounts.";
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({
    email, password
  });

  if (error && error.message.toLowerCase().includes("invalid login")) {
    const result = await db.auth.signUp({ email, password });
    if (result.error) {
      message.textContent = result.error.message;
    } else {
      message.textContent =
        "Account created. Check your email if confirmation is enabled.";
    }
  } else if (error) {
    message.textContent = error.message;
  } else {
    message.textContent = "Welcome! " + data.user.email;
    authDialog.close();
    updateLoginState();
  }
});

async function updateLoginState() {
  if (!db) return;
  const { data } = await db.auth.getUser();
  document.getElementById("loginBtn").textContent =
    data.user ? "Account" : "Login";
}

// Upload contribution
document.getElementById("uploadForm").addEventListener("submit",
  async event => {
    event.preventDefault();

    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("file");
    const message = document.getElementById("uploadMessage");

    if (!file || file.type !== "application/pdf" ||
        !file.name.toLowerCase().endsWith(".pdf")) {
      message.textContent = "Please select a valid PDF.";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      message.textContent = "Maximum PDF size is 10 MB.";
      return;
    }

    const record = {
      title: values.get("title").trim(),
      subject: values.get("subject").trim(),
      semester: Number(values.get("semester")),
      type: values.get("type"),
      author: values.get("author").trim()
    };

    if (!record.title || !record.subject ||
        !record.author || !Number.isInteger(record.semester) ||
        record.semester < 1 || record.semester > 8) {
      message.textContent = "Please complete all fields correctly.";
      return;
    }

    if (!db) {
      const localURL = URL.createObjectURL(file);
      const existing = JSON.parse(
        localStorage.getItem("campusnotes_demo") || "[]"
      );

      existing.push({
        ...record,
        id: crypto.randomUUID(),
        url: localURL,
        status: "pending"
      });

      localStorage.setItem("campusnotes_demo", JSON.stringify(existing));

      message.textContent =
        "Demo submission saved in this browser. It is not shared online.";
      form.reset();
      return;
    }

    const { data: userData, error: userError } =
      await db.auth.getUser();

    if (userError || !userData.user) {
      message.textContent = "Please log in before contributing.";
      return;
    }

    message.textContent = "Uploading PDF...";

    const path = `${userData.user.id}/${crypto.randomUUID()}.pdf`;

    const { error: storageError } = await db.storage
      .from(config.STORAGE_BUCKET)
      .upload(path, file, {
        contentType: "application/pdf",
        upsert: false
      });

    if (storageError) {
      message.textContent = storageError.message;
      return;
    }

    const { error: insertError } = await db
      .from("resources")
      .insert({
        ...record,
        storage_path: path,
        user_id: userData.user.id,
        status: "pending"
      });

    if (insertError) {
      await db.storage.from(config.STORAGE_BUCKET).remove([path]);
      message.textContent = insertError.message;
      return;
    }

    message.textContent = "Successfully submitted for admin approval!";
    form.reset();
  }
);

// Admin approval dashboard via URL: ?admin=1
async function loadAdmin() {
  if (!db || !new URLSearchParams(location.search).has("admin")) return;

  const { data: userData } = await db.auth.getUser();
  if (!userData.user) return;

  const { data: isAdmin } = await db.rpc("is_admin");

  if (!isAdmin) return;

  const { data, error } = await db.from("resources")
    .select("*")
    .eq("status", "pending");

  if (error) {
    console.error(error);
    return;
  }

  const panel = document.createElement("section");
  panel.className = "section";
  panel.innerHTML = `
    <h2>Admin approval panel</h2>
    <div id="pendingList"></div>
  `;

  document.querySelector("main").append(panel);

  const list = panel.querySelector("#pendingList");

  for (const item of data || []) {
    const row = document.createElement("div");
    row.className = "resource-card";
    row.innerHTML = `
      <h3>${escapeHTML(item.title)}</h3>
      <p>${escapeHTML(item.subject)} · Semester ${escapeHTML(item.semester)}</p>
      <button class="primary-btn" data-action="approve">Approve</button>
      <button class="icon-btn" data-action="reject">Reject</button>
    `;

    row.addEventListener("click", async event => {
      const action = event.target.dataset.action;
      if (!action) return;

      const { error } = await db.rpc("moderate_resource", {
        resource_id: item.id,
        new_status: action === "approve" ? "approved" : "rejected"
      });

      if (error) {
        alert(error.message);
      } else {
        row.remove();
        await loadResources();
      }
    });

    list.append(row);
  }
}

document.getElementById("year").textContent = new Date().getFullYear();

loadResources();
updateLoginState();
loadAdmin();
