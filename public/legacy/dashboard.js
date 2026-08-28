import { supabase } from "./supabase.js";

const BUCKET = "news-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
let currentUser = null;
let currentRole = "user";
let editingImageUrl = null;

const $ = (id) => document.getElementById(id);

function showMessage(text, error = false) {
  const box = $("dashboardMessage");
  if (!box) return;
  box.textContent = text;
  box.className = `dashboard-message ${error ? "error" : "success"}`;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box.classList.add("hidden"), 4500);
}

function articleUrl(kind, id, title) { const slug = String(title || "news").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-+/g, "-").slice(0, 90).replace(/-+$/g, "") || "news"; return `/news/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${slug}`; }
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getProfile(userId) {
  try {
    const { data: session } = await supabase.auth.getSession();
    const token = session.session?.access_token;
    if (token) {
      const response = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) return await response.json();
    }
  } catch {}
  const { data } = await supabase.from("users").select("id,full_name,role").eq("id", userId).maybeSingle();
  return data || { id: userId, role: "user" };
}

function isPrivileged() {
  return currentRole === "author" || currentRole === "admin";
}

function resetEditor() {
  $("articleForm").reset();
  $("articleId").value = "";
  $("editorTitle").textContent = "Create article";
  $("saveArticleBtn").textContent = isPrivileged() ? "Publish Article" : "Submit for approval";
  $("publishNow").checked = isPrivileged();
  $("publishNow").disabled = !isPrivileged();
  $("publishHint").textContent = isPrivileged()
    ? "Your role can publish immediately."
    : "User submissions are reviewed by an admin before appearing on the homepage.";
  editingImageUrl = null;
  $("articleImageFile").value = "";
  $("imagePreviewBox").classList.add("hidden");
  $("imagePreview").removeAttribute("src");
}

function openEditor(article = null) {
  $("editor").classList.remove("hidden");

  if (!article) {
    resetEditor();
  } else {
    $("editorTitle").textContent = "Edit article";
    $("saveArticleBtn").textContent = isPrivileged() ? "Update Article" : "Resubmit for approval";
    $("articleId").value = article.id;
    $("articleTitle").value = article.title || "";
    $("articleCategory").value = article.category || "Kenya";
    $("articleSummary").value = article.summary || "";
    $("articleContent").value = article.content || "";
    $("publishNow").checked = isPrivileged() && article.status === "published";
    $("publishNow").disabled = !isPrivileged();
    $("publishHint").textContent = isPrivileged()
      ? "Your role can publish immediately."
      : "Saving a user article sends it for admin approval.";
    $("articleImageFile").value = "";
    editingImageUrl = article.image_url || null;

    if (editingImageUrl) {
      $("imagePreview").src = editingImageUrl;
      $("imagePreviewBox").classList.remove("hidden");
    } else {
      $("imagePreviewBox").classList.add("hidden");
    }
  }

  $("editor").scrollIntoView({ behavior: "smooth", block: "start" });
  setTimeout(() => $("articleTitle").focus(), 100);
}

function closeEditor() {
  $("editor").classList.add("hidden");
  resetEditor();
}

async function uploadImage(file) {
  if (!file) return null;
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) throw new Error("Use JPG, PNG, WebP or GIF only.");
  if (file.size > MAX_IMAGE_SIZE) throw new Error("The image must be 5 MB or smaller.");

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600", contentType: file.type, upsert: false
  });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function removeStorageImage(url) {
  if (!url) return;
  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return;
  const path = decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  if (path) await supabase.storage.from(BUCKET).remove([path]);
}

async function getOwnArticle(id) {
  const { data, error } = await supabase.from("news").select("*").eq("id", id).eq("author_id", currentUser.id).single();
  if (error) throw error;
  return data;
}

async function loadArticles() {
  const list = $("articlesList");
  const { data, error } = await supabase.from("news").select("*").eq("author_id", currentUser.id).order("created_at", { ascending: false });
  if (error) { list.innerHTML = ""; showMessage(error.message, true); return; }

  if (!data.length) {
    list.innerHTML = `<div class="empty-state"><h3>You have no articles yet.</h3><p>Click <strong>+ New article</strong> to submit your first Newsight story.</p></div>`;
    return;
  }

  list.innerHTML = data.map(article => {
    const publicArticle = article.status === "published";
    const pending = article.approval_status === "pending";
    const statusLabel = pending ? "pending approval" : article.status;
    return `
      <article class="manage-card">
        <div class="manage-image">${article.image_url ? `<img src="${escapeHtml(article.image_url)}" alt="">` : `<div class="no-image">No image</div>`}</div>
        <div class="manage-body">
          <div class="manage-meta"><span class="status ${escapeHtml(article.status)}">${escapeHtml(statusLabel)}</span><span class="category">${escapeHtml(article.category || "")}</span></div>
          <h3>${publicArticle ? `<a href="${articleUrl("community", article.id, article.title)}">${escapeHtml(article.title)}</a>` : escapeHtml(article.title)}</h3>
          <p>${escapeHtml(article.summary || "")}</p>
          <small>${article.created_at ? new Date(article.created_at).toLocaleString() : ""}</small>
          <div class="manage-actions">
            ${publicArticle ? `<a class="read-article" href="${articleUrl("community", article.id, article.title)}">Read Story →</a>` : `<span class="read-article disabled">${pending ? "Awaiting admin approval" : "Not public"}</span>`}
            <button class="edit-article" type="button" data-id="${escapeHtml(article.id)}">Edit</button>
            <button class="delete-article" type="button" data-id="${escapeHtml(article.id)}">Delete</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

$("newArticleBtn").addEventListener("click", () => openEditor());
$("closeEditorBtn").addEventListener("click", closeEditor);
$("cancelEditorBtn").addEventListener("click", closeEditor);

$("articleImageFile").addEventListener("change", () => {
  const file = $("articleImageFile").files[0];
  if (!file) { $("imagePreviewBox").classList.add("hidden"); return; }
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowed.includes(file.type)) { showMessage("Only JPG, PNG, WebP and GIF images are allowed.", true); $("articleImageFile").value = ""; return; }
  if (file.size > MAX_IMAGE_SIZE) { showMessage("Image must be 5 MB or smaller.", true); $("articleImageFile").value = ""; return; }
  $("imagePreview").src = URL.createObjectURL(file);
  $("imagePreviewBox").classList.remove("hidden");
});

$("removeImageBtn").addEventListener("click", () => {
  $("articleImageFile").value = "";
  editingImageUrl = null;
  $("imagePreview").removeAttribute("src");
  $("imagePreviewBox").classList.add("hidden");
});

$("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  window.location.href = "/";
});

$("articleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const saveButton = $("saveArticleBtn");
  saveButton.disabled = true;
  saveButton.textContent = "Saving…";

  let uploadedUrl = null;
  try {
    const id = $("articleId").value.trim();
    const title = $("articleTitle").value.trim();
    const category = $("articleCategory").value;
    const summary = $("articleSummary").value.trim();
    const content = $("articleContent").value.trim();
    const requestedPublish = $("publishNow").checked && isPrivileged();
    const status = requestedPublish ? "published" : "draft";
    const approval_status = requestedPublish ? "approved" : "pending";
    const imageFile = $("articleImageFile").files[0] || null;

    if (!title || !content) throw new Error("Headline and content are required.");
    if (!imageFile && !editingImageUrl) throw new Error("An article image is required.");

    let oldImage = null;
    if (id) oldImage = (await getOwnArticle(id)).image_url || null;
    if (imageFile) uploadedUrl = await uploadImage(imageFile);
    const imageUrl = uploadedUrl || oldImage || null;
    if (!imageUrl) throw new Error("Please select an article image.");

    const payload = {
      title, category, summary, content, image_url: imageUrl,
      status,
      approval_status,
      author_id: currentUser.id,
      published_at: status === "published" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { error } = await supabase.from("news").update(payload).eq("id", id).eq("author_id", currentUser.id);
      if (error) throw error;
      if (uploadedUrl && oldImage && oldImage !== uploadedUrl) await removeStorageImage(oldImage);
      showMessage(isPrivileged() ? "Article updated successfully." : "Article resubmitted for admin approval.");
    } else {
      const { error } = await supabase.from("news").insert(payload);
      if (error) { if (uploadedUrl) await removeStorageImage(uploadedUrl); throw error; }
      showMessage(isPrivileged() ? "Article published successfully." : "Article submitted for admin approval.");
    }

    closeEditor();
    await loadArticles();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Could not save article.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = $("articleId").value ? (isPrivileged() ? "Update Article" : "Resubmit for approval") : (isPrivileged() ? "Publish Article" : "Submit for approval");
  }
});

$("articlesList").addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-article");
  const deleteButton = event.target.closest(".delete-article");
  if (editButton) {
    try { openEditor(await getOwnArticle(editButton.dataset.id)); } catch (error) { showMessage(error.message, true); }
  }
  if (deleteButton) {
    const id = deleteButton.dataset.id;
    if (!confirm("Delete this article and its image?")) return;
    try {
      const article = await getOwnArticle(id);
      const { error } = await supabase.from("news").delete().eq("id", id).eq("author_id", currentUser.id);
      if (error) throw error;
      if (article.image_url) await removeStorageImage(article.image_url);
      showMessage("Article deleted.");
      await loadArticles();
    } catch (error) { showMessage(error.message, true); }
  }
});

async function initDashboard() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) { window.location.href = "/login.html"; return; }

  currentUser = data.user;
  const profile = await getProfile(currentUser.id);
  currentRole = ["user", "author", "admin"].includes(profile.role) ? profile.role : "user";
  $("userEmail").textContent = profile.full_name ? `${profile.full_name} • ${currentRole}` : `${currentUser.email || ""} • ${currentRole}`;
  $("dashboardRole").textContent = currentRole === "user" ? "Reader / pending publisher" : `${currentRole.charAt(0).toUpperCase()}${currentRole.slice(1)} publisher`;
  if (currentRole === "admin") {
    $("adminLink").classList.remove("hidden");
  }
  resetEditor();
  await loadArticles();
}

initDashboard();
