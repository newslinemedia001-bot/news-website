import { supabase } from "./supabase.js";

const BUCKET = "news-images";
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;
let currentUser = null;
let editingImageUrl = null;

const $ = (id) => document.getElementById(id);

function showMessage(text, error = false) {
  const box = $("dashboardMessage");
  box.textContent = text;
  box.className = `dashboard-message ${error ? "error" : "success"}`;
  clearTimeout(showMessage.timer);
  showMessage.timer = setTimeout(() => box.classList.add("hidden"), 4500);
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function resetEditor() {
  $("articleForm").reset();
  $("articleId").value = "";
  $("editorTitle").textContent = "Create article";
  $("saveArticleBtn").textContent = "Publish Article";
  $("publishNow").checked = true;
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
    $("saveArticleBtn").textContent = "Update Article";
    $("articleId").value = article.id;
    $("articleTitle").value = article.title || "";
    $("articleCategory").value = article.category || "Kenya";
    $("articleSummary").value = article.summary || "";
    $("articleContent").value = article.content || "";
    $("publishNow").checked = article.status === "published";
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

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowed.includes(file.type)) {
    throw new Error("Use JPG, PNG, WebP or GIF only.");
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error("The image must be 5 MB or smaller.");
  }

  const extension = (file.name.split(".").pop() || "jpg")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "") || "jpg";

  const path = `${currentUser.id}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false
    });

  if (error) throw error;

  return supabase.storage
    .from(BUCKET)
    .getPublicUrl(path).data.publicUrl;
}

async function removeStorageImage(url) {
  if (!url) return;

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = url.indexOf(marker);

  if (index === -1) return;

  const path = decodeURIComponent(
    url.slice(index + marker.length).split("?")[0]
  );

  if (path) {
    await supabase.storage.from(BUCKET).remove([path]);
  }
}

async function getOwnArticle(id) {
  const { data, error } = await supabase
    .from("news")
    .select("*")
    .eq("id", id)
    .eq("author_id", currentUser.id)
    .single();

  if (error) throw error;
  return data;
}

async function loadArticles() {
  const list = $("articlesList");

  const { data, error } = await supabase
    .from("news")
    .select("*")
    .eq("author_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    list.innerHTML = "";
    showMessage(error.message, true);
    return;
  }

  if (!data.length) {
    list.innerHTML = `
      <div class="empty-state">
        <h3>You have no articles yet.</h3>
        <p>Click <strong>+ New Article</strong> to publish your first Newsight story.</p>
      </div>`;
    return;
  }

  list.innerHTML = data.map(article => `
    <article class="manage-card">
      <div class="manage-image">
        ${
          article.image_url
            ? `<img src="${escapeHtml(article.image_url)}" alt="">`
            : `<div class="no-image">No image</div>`
        }
      </div>
      <div class="manage-body">
        <div class="manage-meta">
          <span class="status ${article.status}">${article.status}</span>
          <span class="category">${escapeHtml(article.category)}</span>
        </div>
        <h3><a href="/article?kind=community&id=${encodeURIComponent(article.id)}">${escapeHtml(article.title)}</a></h3>
        <p>${escapeHtml(article.summary || "")}</p>
        <small>${new Date(article.created_at).toLocaleString()}</small>
        <div class="manage-actions">
          ${article.status === "published"
            ? `<a class="read-article" href="/article?kind=community&id=${encodeURIComponent(article.id)}">Read Story →</a>`
            : `<span class="read-article disabled" title="Publish this story to read it publicly">Draft — not public</span>`}
          <button class="edit-article" type="button" data-id="${article.id}">Edit</button>
          <button class="delete-article" type="button" data-id="${article.id}">Delete</button>
        </div>
      </div>
    </article>
  `).join("");
}

$("newArticleBtn").addEventListener("click", () => {
  // This button is intentionally simple and directly wired to the editor.
  openEditor();
});

$("closeEditorBtn").addEventListener("click", closeEditor);
$("cancelEditorBtn").addEventListener("click", closeEditor);

$("articleImageFile").addEventListener("change", () => {
  const file = $("articleImageFile").files[0];

  if (!file) {
    $("imagePreviewBox").classList.add("hidden");
    return;
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif"
  ];

  if (!allowed.includes(file.type)) {
    showMessage("Only JPG, PNG, WebP and GIF images are allowed.", true);
    $("articleImageFile").value = "";
    $("imagePreviewBox").classList.add("hidden");
    return;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    showMessage("Image must be 5 MB or smaller.", true);
    $("articleImageFile").value = "";
    $("imagePreviewBox").classList.add("hidden");
    return;
  }

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
    const status = $("publishNow").checked ? "published" : "draft";
    const imageFile = $("articleImageFile").files[0] || null;

    if (!title || !content) {
      throw new Error("Headline and content are required.");
    }

    let oldImage = null;

    if (id) {
      const existing = await getOwnArticle(id);
      oldImage = existing.image_url || null;
    }

    if (imageFile) {
      uploadedUrl = await uploadImage(imageFile);
    }

    const imageUrl = uploadedUrl || oldImage || null;

    const payload = {
      title,
      category,
      summary,
      content,
      image_url: imageUrl,
      status,
      author_id: currentUser.id,
      published_at: status === "published"
        ? new Date().toISOString()
        : null,
      updated_at: new Date().toISOString()
    };

    if (id) {
      const { error } = await supabase
        .from("news")
        .update(payload)
        .eq("id", id)
        .eq("author_id", currentUser.id);

      if (error) throw error;

      if (uploadedUrl && oldImage && oldImage !== uploadedUrl) {
        await removeStorageImage(oldImage);
      }

      showMessage("Article updated successfully.");
    } else {
      const { error } = await supabase
        .from("news")
        .insert(payload);

      if (error) {
        if (uploadedUrl) await removeStorageImage(uploadedUrl);
        throw error;
      }

      showMessage("Article published successfully.");
    }

    closeEditor();
    await loadArticles();
  } catch (error) {
    console.error(error);
    showMessage(error.message || "Could not save article.", true);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = $("articleId").value
      ? "Update Article"
      : "Publish Article";
  }
});

$("articlesList").addEventListener("click", async (event) => {
  const editButton = event.target.closest(".edit-article");
  const deleteButton = event.target.closest(".delete-article");

  if (editButton) {
    try {
      openEditor(await getOwnArticle(editButton.dataset.id));
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  if (deleteButton) {
    const id = deleteButton.dataset.id;

    if (!confirm("Delete this article and its image?")) return;

    try {
      const article = await getOwnArticle(id);

      const { error } = await supabase
        .from("news")
        .delete()
        .eq("id", id)
        .eq("author_id", currentUser.id);

      if (error) throw error;

      if (article.image_url) {
        await removeStorageImage(article.image_url);
      }

      showMessage("Article deleted.");
      await loadArticles();
    } catch (error) {
      showMessage(error.message, true);
    }
  }
});

async function initDashboard() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    window.location.href = "/login.html";
    return;
  }

  currentUser = data.user;
  $("userEmail").textContent = currentUser.email || "";

  await loadArticles();
}

initDashboard();
