import {
  getAdminClassrooms,
  getAdminMemberships,
  getAdminQuizzes,
  getAdminStudents,
  getAdminTeachers,
  getProfile,
  getTeacherInvites,
  inviteTeacher,
  updateTeacherProfile,
  deleteTeacher,
} from "../lib/classroom.js";
import { navigate } from "../router.js";
import { createIcons, icons } from "lucide";
import ApexCharts from "apexcharts";
import ApexTree from "apextree";

const escape = (value = "") =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const newCode = () =>
  Array.from(crypto.getRandomValues(new Uint32Array(2)))
    .map((value) => value.toString(36).toUpperCase())
    .join("")
    .slice(0, 8);
const genderLabel = (value) =>
  ({
    female: "Female",
    male: "Male",
    other: "Other",
    unspecified: "Unspecified",
  })[value] || "Unspecified";
const quizTypeLabel = (type) =>
  ({ alphabet: "Alphabet", spelling: "Spelling", word_sign: "Word sign" })[
    type
  ] || type;

let pendingAdminMessage = null;
let activeAdminCharts = [];
let activeStudentTree = null;
let activityFilters = { search: "", type: "", status: "" };

function destroyStudentTree() {
  activeStudentTree?.destroy();
  activeStudentTree = null;
}

function getAdminView() {
  const path = window.location.hash.slice(1) || "/admin";
  if (path.startsWith("/admin/teachers")) return "teachers";
  if (path.startsWith("/admin/activities")) return "activities";
  return "dashboard";
}

function destroyAdminCharts() {
  activeAdminCharts.forEach((chart) => {
    try {
      chart.destroy();
    } catch {}
  });
  activeAdminCharts = [];
}

function renderApexChart(
  container,
  selector,
  { labels, values, name, type = "bar" },
) {
  const target = container.querySelector(selector);
  if (!target) return;
  const hasData = values.some((value) => Number(value) > 0);
  const options = {
    chart: {
      type,
      height: 300,
      toolbar: { show: false },
      fontFamily: "Inter, system-ui, sans-serif",
    },
    series: hasData
      ? type === "donut"
        ? values
        : [{ name, data: values }]
      : [],
    ...(type === "donut" ? { labels } : {}),
    ...(type === "bar"
      ? {
          xaxis: {
            categories: labels,
            labels: { style: { colors: "#64748b" } },
          },
          yaxis: { labels: { style: { colors: "#64748b" } } },
          plotOptions: { bar: { borderRadius: 6, columnWidth: "48%" } },
        }
      : {}),
    dataLabels: { enabled: true },
    colors: [
      "#2563eb",
      "#14b8a6",
      "#f59e0b",
      "#ef4444",
      "#8b5cf6",
      "#06b6d4",
      "#84cc16",
      "#f97316",
    ],
    grid: { borderColor: "#e2e8f0", strokeDashArray: 4 },
    legend: { position: "bottom", labels: { colors: "#334155" } },
    noData: { text: hasData ? "" : "No data yet" },
  };
  const chart = new ApexCharts(target, options);
  activeAdminCharts.push(chart);
  chart.render();
}

function renderDashboard({ teachers, students, classrooms }) {
  return `
    <div class="FSL-dashboard__heading"><div><span class="FSL-eyebrow">Admin dashboard</span><h1>School overview</h1><p>Population, teacher ownership, and classroom-level activity.</p></div></div>
    <div class="FSL-metric-grid"><div class="FSL-metric"><strong>${teachers.length}</strong><span>Teachers</span></div><div class="FSL-metric"><strong>${students.length}</strong><span>Students</span></div><div class="FSL-metric"><strong>${classrooms.length}</strong><span>Classrooms</span></div><div class="FSL-metric"><strong>${classrooms.filter((room) => room.is_open).length}</strong><span>Open rooms</span></div></div>
    <div class="FSL-report-grid">
      <section class="FSL-card"><h2>Population by gender</h2><div id="admin-population-gender-chart" class="FSL-apex-chart"></div></section>
      <section class="FSL-card"><h2>Students by teacher</h2><div id="admin-students-teacher-chart" class="FSL-apex-chart"></div></section>
    </div>`;
}

function renderAdminDashboardCharts(
  container,
  { teachers, students, classrooms, memberships },
) {
  const genderKeys = ["female", "male", "other", "unspecified"];
  const genderLabels = genderKeys.map(genderLabel);
  renderApexChart(container, "#admin-population-gender-chart", {
    labels: genderLabels,
    values: genderKeys.map(
      (gender) =>
        teachers.filter((item) => (item.gender || "unspecified") === gender)
          .length +
        students.filter((item) => (item.gender || "unspecified") === gender)
          .length,
    ),
    name: "Users",
    type: "donut",
  });
  renderApexChart(container, "#admin-students-teacher-chart", {
    labels: classrooms.map(
      (room) => room.profiles?.full_name || room.profiles?.email || room.name,
    ),
    values: classrooms.map(
      (room) =>
        new Set(
          memberships
            .filter((member) => member.classroom_id === room.id)
            .map((member) => member.student_id),
        ).size,
    ),
    name: "Students",
  });
}

function renderTeacherList({ teachers, invites }) {
  return `
    <div class="FSL-section__heading">
      <div><span class="FSL-eyebrow">Admin records</span><h1>Teacher List</h1><p>Registered teachers and pending invitations.</p></div>
      <button type="button" class="FSL-btn FSL-btn--primary" data-action="register-teacher"><i data-lucide="user-plus"></i>Register Teacher</button>
    </div>
    <section class="FSL-section"><div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Teacher</th><th>Email</th><th>Gender</th><th>Created</th><th>Actions</th></tr></thead><tbody>${teachers.map((teacher) => `<tr><td>${escape(teacher.full_name || "-")}</td><td>${escape(teacher.email || "-")}</td><td>${escape(genderLabel(teacher.gender))}</td><td>${new Date(teacher.created_at).toLocaleDateString()}</td><td><button type="button" class="FSL-icon-btn" data-action="edit-teacher" data-id="${escape(teacher.id)}" aria-label="Edit teacher" title="Edit teacher"><i data-lucide="pencil"></i></button><button type="button" class="FSL-icon-btn FSL-icon-btn--danger" data-action="delete-teacher" data-id="${escape(teacher.id)}" aria-label="Delete teacher" title="Delete teacher"><i data-lucide="trash-2"></i></button></td></tr>`).join("") || '<tr><td colspan="5" class="FSL-empty">No teachers have registered yet.</td></tr>'}</tbody></table></div></section>
    <section class="FSL-section"><h2>Teacher invitations</h2><div class="FSL-table-wrap"><table class="FSL-table"><thead><tr><th>Teacher</th><th>Email</th><th>Invitation code</th><th>Status</th></tr></thead><tbody>${invites.map((invite) => `<tr><td>${escape(invite.full_name)}</td><td>${escape(invite.email)}</td><td><code>${escape(invite.invite_code)}</code></td><td><span class="FSL-status ${invite.used_at ? "FSL-status--active" : ""}">${invite.used_at ? "Registered" : "Pending"}</span></td></tr>`).join("") || '<tr><td colspan="4" class="FSL-empty">Create your first teacher invitation.</td></tr>'}</tbody></table></div></section>`;
}

function filteredActivities(quizzes, teacherId) {
  return quizzes.filter(
    (quiz) =>
      quiz.teacher_id === teacherId &&
      (!activityFilters.type || quiz.quiz_type === activityFilters.type) &&
      (!activityFilters.status ||
        (activityFilters.status === "published"
          ? quiz.is_published
          : !quiz.is_published)),
  );
}

function handledStudents(data, teacherId) {
  const rooms = new Set(
    data.classrooms
      .filter((room) => room.teacher_id === teacherId)
      .map((room) => room.id),
  );
  const ids = new Set(
    data.memberships
      .filter((member) => rooms.has(member.classroom_id))
      .map((member) => member.student_id),
  );
  return data.students.filter((student) => ids.has(student.id));
}

function renderActivityCards(data) {
  const search = activityFilters.search.trim().toLowerCase();
  const teachers = data.teachers.filter(
    (teacher) =>
      `${teacher.full_name || ""} ${teacher.email || ""}`
        .toLowerCase()
        .includes(search) &&
      (!(activityFilters.type || activityFilters.status) ||
        filteredActivities(data.quizzes, teacher.id).length),
  );
  return `<p class="FSL-muted" role="status">${teachers.length} teacher${teachers.length === 1 ? "" : "s"} found</p><section class="FSL-activity-grid">${
    teachers
      .map((teacher) => {
        const quizzes = filteredActivities(data.quizzes, teacher.id);
        const students = handledStudents(data, teacher.id);
        return `<article class="FSL-activity-card">
      <span class="FSL-activity-card__icon"><i data-lucide="graduation-cap"></i></span>
      <strong>${escape(teacher.full_name || teacher.email)}</strong>
      <small>${quizzes.length} activities · ${students.length} handled students</small>
      <div class="FSL-table-actions">
        <button type="button" class="FSL-icon-btn" data-action="view-teacher-activities" data-id="${escape(teacher.id)}" title="Show activities" aria-label="Show activities for ${escape(teacher.full_name || teacher.email)}"><i data-lucide="library-big"></i></button>
        <button type="button" class="FSL-icon-btn" data-action="view-handled-students" data-id="${escape(teacher.id)}" title="Show handled students" aria-label="Show handled students for ${escape(teacher.full_name || teacher.email)}"><i data-lucide="users-round"></i></button>
      </div>
    </article>`;
      })
      .join("") ||
    '<div class="FSL-empty-card">No teachers match these filters.</div>'
  }</section>`;
}

function renderActivities(data) {
  return `<div class="FSL-section__heading"><div><span class="FSL-eyebrow">Admin activities</span><h1>Activities</h1><p>Browse teacher activities and handled students.</p></div></div>
    <form class="FSL-form FSL-activity-filters" id="admin-activity-filters" role="search">
      <label>Search teacher<input name="search" type="search" placeholder="Name or email" value="${escape(activityFilters.search)}"></label>
      <label>Activity type<select name="type"><option value="">All types</option>${["alphabet", "spelling", "word_sign"].map((type) => `<option value="${type}" ${activityFilters.type === type ? "selected" : ""}>${quizTypeLabel(type)}</option>`).join("")}</select></label>
      <label>Status<select name="status"><option value="">All statuses</option><option value="published" ${activityFilters.status === "published" ? "selected" : ""}>Published</option><option value="draft" ${activityFilters.status === "draft" ? "selected" : ""}>Draft</option></select></label>
      <button type="reset" class="FSL-btn FSL-btn--secondary">Clear filters</button>
    </form><div id="admin-activity-results">${renderActivityCards(data)}</div>`;
}

export async function mount(container) {
  document.body.classList.remove("FSL-modal-open", "FSL-drawer-open");
  container.innerHTML =
    '<div class="FSL-container"><div class="FSL-card">Loading administrator panel...</div></div>';
  try {
    const profile = await getProfile();
    if (!profile) {
      navigate("#/auth/login");
      return;
    }
    if (profile.role !== "admin") {
      navigate(profile.role === "teacher" ? "#/teacher" : "#/student");
      return;
    }
    const [teachers, students, classrooms, memberships, quizzes, invites] =
      await Promise.all([
        getAdminTeachers(),
        getAdminStudents(),
        getAdminClassrooms(),
        getAdminMemberships(),
        getAdminQuizzes(),
        getTeacherInvites(),
      ]);
    render(container, {
      teachers,
      students,
      classrooms,
      memberships,
      quizzes,
      invites,
    });
  } catch (error) {
    container.innerHTML = `<div class="FSL-container"><div class="FSL-card"><h2>Administrator setup needed</h2><p>${escape(error.message)}</p><p>Run the updated Supabase schema and admin seed scripts first.</p></div></div>`;
  }
}

function render(container, data) {
  destroyAdminCharts();
  destroyStudentTree();
  const view = getAdminView();
  const actionMessage = pendingAdminMessage;
  pendingAdminMessage = null;
  const content = {
    dashboard: renderDashboard(data),
    teachers: renderTeacherList(data),
    activities: renderActivities(data),
  }[view];

  container.innerHTML = `
    <div class="FSL-dashboard FSL-container">
      <div id="admin-action-message" class="FSL-form__message ${actionMessage ? `FSL-form__message--${actionMessage.type}` : ""}" aria-live="polite">${actionMessage ? escape(actionMessage.text) : ""}</div>
      ${content}
    </div>`;
  createIcons({ icons });
  if (view === "dashboard") renderAdminDashboardCharts(container, data);

  const closeModal = () => {
    container.querySelector(".FSL-modal-backdrop")?.remove();
    document.body.classList.remove("FSL-modal-open");
  };
  const closeDrawer = () => {
    destroyStudentTree();
    container.querySelector(".FSL-drawer-backdrop")?.remove();
    container.querySelector(".FSL-info-drawer")?.remove();
    document.body.classList.remove("FSL-drawer-open");
  };

  const openDeleteTeacherModal = (teacher, trigger) => {
    closeModal();
    let deleting = false;
    const backdrop = document.createElement("div");
    backdrop.className = "FSL-modal-backdrop is-open";
    backdrop.innerHTML = `
      <section class="FSL-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-teacher-title" aria-describedby="delete-teacher-description" tabindex="-1">
        <div class="FSL-modal__header">
          <h2 id="delete-teacher-title">Delete teacher?</h2>
          <button type="button" class="FSL-modal__close" data-delete-cancel aria-label="Close confirmation"><i data-lucide="x"></i></button>
        </div>
        <p id="delete-teacher-description">Permanently delete <strong>${escape(teacher.full_name || teacher.email)}</strong> and their login account, invitation, classroom, quizzes, and learning materials? Student accounts and attempt history are kept. This cannot be undone.</p>
        <div class="FSL-form__message FSL-form__message--error" role="alert" data-delete-error></div>
        <div class="FSL-modal__actions">
          <button type="button" class="FSL-btn FSL-btn--secondary" data-delete-cancel>Cancel</button>
          <button type="button" class="FSL-btn FSL-btn--danger" data-delete-confirm>Delete teacher</button>
        </div>
      </section>`;
    container.append(backdrop);
    document.body.classList.add("FSL-modal-open");
    createIcons({ icons });
    const dialog = backdrop.querySelector('[role="alertdialog"]');
    const confirm = backdrop.querySelector("[data-delete-confirm]");
    const cancel = backdrop.querySelector(
      ".FSL-modal__actions [data-delete-cancel]",
    );
    const dismiss = () => {
      if (deleting) return;
      closeModal();
      if (trigger.isConnected) trigger.focus();
    };
    backdrop.addEventListener("click", (event) => {
      if (
        event.target === backdrop ||
        event.target.closest("[data-delete-cancel]")
      )
        dismiss();
    });
    backdrop.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dismiss();
      }
      if (event.key !== "Tab") return;
      const buttons = [...backdrop.querySelectorAll("button:not(:disabled)")];
      const first = buttons[0],
        last = buttons[buttons.length - 1];
      if (!first) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
    confirm.addEventListener("click", async () => {
      if (deleting) return;
      deleting = true;
      backdrop.querySelector("[data-delete-error]").textContent = "";
      backdrop.querySelectorAll("button").forEach((button) => {
        button.disabled = true;
      });
      confirm.textContent = "Deleting…";
      dialog.setAttribute("aria-busy", "true");
      dialog.focus();
      try {
        await deleteTeacher(teacher.id);
        pendingAdminMessage = {
          text: "Teacher account and invitation deleted.",
          type: "success",
        };
        closeModal();
        await mount(container);
      } catch (error) {
        deleting = false;
        backdrop.querySelector("[data-delete-error]").textContent =
          error.message || "Could not delete teacher.";
        backdrop.querySelectorAll("button").forEach((button) => {
          button.disabled = false;
        });
        confirm.textContent = "Delete teacher";
        dialog.removeAttribute("aria-busy");
        cancel.focus();
      }
    });
    cancel.focus();
  };

  const openTeacherModal = (teacher = null) => {
    closeModal();
    const code = newCode();
    const backdrop = document.createElement("div");
    backdrop.className = "FSL-modal-backdrop is-open";
    backdrop.innerHTML = `
      <section class="FSL-modal" role="dialog" aria-modal="true" aria-labelledby="admin-teacher-title">
        <div class="FSL-modal__header">
          <div><span class="FSL-eyebrow">Teacher access</span><h2 id="admin-teacher-title">${teacher ? "Edit Teacher" : "Register Teacher"}</h2><p>${teacher ? "Update the teacher’s name and gender." : "Create a teacher invitation and email access link."}</p></div>
          <button type="button" class="FSL-modal__close" aria-label="Close form"><i data-lucide="x"></i></button>
        </div>
        <form class="FSL-form">
          <label>Teacher name<input name="fullName" required maxlength="100" placeholder="Teacher full name" value="${escape(teacher?.full_name || "")}"></label>
          <label>Email<input name="email" type="email" required placeholder="teacher@school.edu" value="${escape(teacher?.email || "")}" ${teacher ? "readonly" : ""}></label>
          <div class="FSL-form-row">
            <label>Gender<select name="gender"><option value="unspecified">Unspecified</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label>
            ${teacher ? "" : `<label>Invitation code<input name="inviteCode" required maxlength="16" value="${code}" style="text-transform:uppercase"></label>`}
          </div>
          <div id="admin-modal-message" class="FSL-form__message" aria-live="polite"></div>
          <div class="FSL-modal__actions"><button type="button" class="FSL-btn FSL-btn--secondary" data-modal-close>Cancel</button><button class="FSL-btn FSL-btn--primary" type="submit">${teacher ? "Save changes" : "Send invitation"}</button></div>
        </form>
      </section>`;
    container.append(backdrop);
    document.body.classList.add("FSL-modal-open");
    createIcons({ icons });
    const form = backdrop.querySelector("form");
    form.elements.gender.value = teacher?.gender || "unspecified";
    const message = backdrop.querySelector("#admin-modal-message");
    const submit = form.querySelector('[type="submit"]');
    backdrop.addEventListener("click", (event) => {
      if (
        event.target === backdrop ||
        event.target.closest("[data-modal-close], .FSL-modal__close")
      )
        closeModal();
    });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      submit.disabled = true;
      message.textContent = "";
      const fields = new FormData(form);
      try {
        if (teacher) {
          await updateTeacherProfile(teacher.id, {
            full_name: String(fields.get("fullName") || "").trim(),
            gender: String(fields.get("gender") || "unspecified"),
          });
        } else {
          await inviteTeacher({
            fullName: String(fields.get("fullName") || "").trim(),
            email: String(fields.get("email") || "").trim(),
            inviteCode: String(fields.get("inviteCode") || "").trim(),
            gender: String(fields.get("gender") || "unspecified"),
          });
        }
        pendingAdminMessage = {
          text: teacher
            ? "Teacher record updated."
            : "Teacher invitation sent.",
          type: "success",
        };
        closeModal();
        await mount(container);
      } catch (error) {
        message.className = "FSL-form__message FSL-form__message--error";
        message.textContent =
          error.message ||
          (teacher
            ? "Could not update teacher."
            : "Could not register teacher.");
        submit.disabled = false;
      }
    });
    setTimeout(() => form.querySelector("input")?.focus(), 80);
  };

  const openActivityDrawer = (teacherId, showStudents = false) => {
    const teacher = data.teachers.find((item) => item.id === teacherId);
    const quizzes = filteredActivities(data.quizzes, teacherId);
    const students = handledStudents(data, teacherId);
    if (!teacher) return;
    closeDrawer();
    const backdrop = document.createElement("div");
    backdrop.className = "FSL-drawer-backdrop is-open";
    const drawer = document.createElement("aside");
    drawer.className = `FSL-info-drawer is-open${showStudents ? " FSL-info-drawer--students" : ""}`;
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute(
      "aria-label",
      showStudents ? "Handled students" : "Teacher activities",
    );
    drawer.innerHTML = `
      <div class="FSL-form-drawer__header">
        <div><span class="FSL-eyebrow">${showStudents ? "Handled students" : "Teacher activities"}</span><h2>${escape(teacher.full_name || teacher.email)}</h2></div>
        <button type="button" class="FSL-form-drawer__close" aria-label="Close drawer"><i data-lucide="x"></i></button>
      </div>
      <div class="FSL-info-list">${
        quizzes
          .map(
            (quiz) => `
        <article class="FSL-info-list__item">
          <strong>${escape(quiz.title)}</strong>
          <span>${escape(quizTypeLabel(quiz.quiz_type))} · ${quiz.question_count} questions · ${quiz.max_attempts || 1} attempts · ${quiz.is_published ? "Published" : "Draft"}</span>
          <small>${escape(quiz.classrooms?.name || "Classroom")} · ${new Date(quiz.created_at).toLocaleDateString()}</small>
        </article>`,
          )
          .join("") ||
        '<p class="FSL-muted">No activities match the current filters.</p>'
      }</div>`;
    if (showStudents) {
      drawer.querySelector(".FSL-info-list").innerHTML =
        `<p>${students.length} handled students</p>${students.length ? '<p class="FSL-muted">Drag to pan. Use the toolbar to zoom or fit the tree.</p><div class="FSL-student-tree"></div>' : '<p class="FSL-empty-card">No students are assigned to this teacher yet.</p>'}`;
    }
    container.append(backdrop, drawer);
    document.body.classList.add("FSL-drawer-open");
    createIcons({ icons });
    if (showStudents && students.length) {
      const target = drawer.querySelector(".FSL-student-tree");
      try {
        activeStudentTree = new ApexTree(target, {
          width: 800,
          height: 700,
          nodeWidth: 210,
          nodeHeight: 86,
          direction: "top",
          contentKey: "data",
          enableToolbar: true,
          enableAnimation: false,
          childrenSpacing: 60,
          siblingSpacing: 30,
          canvasStyle: "border: 1px solid black;background: #f6f6f6;",
          nodeTemplate: (content) =>
            `<div class="FSL-student-tree__node"><strong>${escape(content.name)}</strong><small>${escape(content.detail)}</small></div>`,
          canvasStyle: "background: #f8fafc; border: 1px solid #e2e8f0;",
        });
        activeStudentTree.render({
          id: `teacher-${teacher.id}`,
          data: { name: teacher.full_name || teacher.email, detail: "Teacher" },
          children: students.map((student) => ({
            id: `student-${student.id}`,
            data: {
              name: student.full_name || student.email,
              detail: student.email || genderLabel(student.gender),
            },
          })),
        });
      } catch (error) {
        destroyStudentTree();
        target.textContent =
          "Could not display the student tree. Please reopen the drawer.";
      }
    }
    drawer.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDrawer();
      if (event.key === "Tab") {
        const controls = [
          ...drawer.querySelectorAll(
            'button, input, select, a[href], [tabindex="0"]',
          ),
        ].filter((el) => !el.disabled);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    });
    drawer.querySelector("button")?.focus();
    backdrop.addEventListener("click", closeDrawer);
    drawer
      .querySelector(".FSL-form-drawer__close")
      ?.addEventListener("click", closeDrawer);
  };

  const filters = container.querySelector("#admin-activity-filters");
  const refreshActivities = () => {
    container.querySelector("#admin-activity-results").innerHTML =
      renderActivityCards(data);
    createIcons({ icons });
  };
  filters?.addEventListener("submit", (event) => event.preventDefault());
  filters?.addEventListener("input", () => {
    activityFilters = Object.fromEntries(new FormData(filters));
    refreshActivities();
  });
  filters?.addEventListener("reset", (event) => {
    event.preventDefault();
    activityFilters = { search: "", type: "", status: "" };
    for (const name of ["search", "type", "status"])
      filters.elements[name].value = "";
    refreshActivities();
  });

  if (container.__adminActionHandler)
    container.removeEventListener("click", container.__adminActionHandler);
  const handleAdminAction = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button || !container.contains(button)) return;
    if (button.dataset.action === "delete-teacher") {
      const teacher = data.teachers.find(
        (item) => item.id === button.dataset.id,
      );
      if (teacher) openDeleteTeacherModal(teacher, button);
    }
    if (button.dataset.action === "edit-teacher") {
      const teacher = data.teachers.find(
        (item) => item.id === button.dataset.id,
      );
      if (teacher) openTeacherModal(teacher);
    }
    if (button.dataset.action === "register-teacher") openTeacherModal();
    if (button.dataset.action === "view-handled-students")
      openActivityDrawer(button.dataset.id, true);
    if (button.dataset.action === "view-teacher-activities")
      openActivityDrawer(button.dataset.id);
  };
  container.__adminActionHandler = handleAdminAction;
  container.addEventListener("click", handleAdminAction);
}

export function unmount() {
  destroyStudentTree();
  destroyAdminCharts();
  document.body.classList.remove("FSL-modal-open", "FSL-drawer-open");
}
