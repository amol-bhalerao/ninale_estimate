import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import clsx from "clsx";
import { motion } from "framer-motion";
import {
  Calculator,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LibraryBig,
  LogOut,
  Menu,
  Plus,
  Printer,
  Save,
  Settings2,
  TableProperties,
  Wand2,
} from "lucide-react";
import "./styles.css";

const api = {
  async request(path, options = {}) {
    const local = ["127.0.0.1", "localhost"].includes(window.location.hostname);
    const appBase = window.location.pathname.endsWith("/")
      ? window.location.pathname
      : window.location.pathname.replace(/[^/]*$/, "");
    const url = local ? `/api/${path}` : `${appBase}backend.php?r=${encodeURIComponent(path)}`;
    const finalUrl = `${url}${url.includes("?") ? "&" : "?"}_=${Date.now()}`;
    const response = await fetch(finalUrl, {
      ...options,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  },
  login() {
    return this.request("login", { method: "POST", body: JSON.stringify({}) });
  },
  templates() {
    return this.request("templates");
  },
  projects() {
    return this.request("projects");
  },
  createProject(body) {
    return this.request("projects", { method: "POST", body: JSON.stringify(body) });
  },
  updateProject(id, body) {
    return this.request(`projects/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  updateTemplate(id, body) {
    return this.request(`templates/${id}`, { method: "PUT", body: JSON.stringify(body) });
  },
  deleteTemplate(id) {
    return this.request(`templates/${id}`, { method: "DELETE" });
  },
};

const nav = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "projects", label: "Projects", icon: ClipboardList },
  { id: "adjust", label: "Adjust Estimate", icon: Settings2 },
  { id: "report", label: "Report", icon: FileText },
  { id: "rates", label: "Rate Master", icon: TableProperties },
  { id: "templates", label: "Templates", icon: LibraryBig },
];

function currency(value) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(Number(value || 0));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function calculate(payload) {
  const items = payload?.items || [];
  const adjustments = payload?.adjustments || {};
  const computedItems = items.map((item) => {
    const amount = Number(item.rate || 0) * Number(item.quantity || 0);
    const cementCost = Number(item.cementRate || 0) * Number(item.quantity || 0);
    const royaltyCost = Number(item.royaltyRate || 0) * Number(item.quantity || 0);
    const machineryCost = Number(item.machineryRate || 0) * Number(item.quantity || 0);
    const labourAmount = Number(item.labourRate || 0) * Number(item.quantity || 0);
    const polAmount = Number(item.polRate || 0) * Number(item.quantity || 0);
    const materialAmount = Math.max(
      0,
      amount - cementCost - royaltyCost - machineryCost - labourAmount - polAmount,
    );
    const excludingCementSteel = Math.max(0, amount - cementCost);
    return { ...item, amount, cementCost, royaltyCost, machineryCost, labourAmount, polAmount, materialAmount, excludingCementSteel };
  });
  const tenderAmount = computedItems.reduce((sum, item) => sum + item.amount, 0);
  const royalty = computedItems.reduce((sum, item) => sum + item.royaltyCost, 0);
  const cement = computedItems.reduce((sum, item) => sum + item.cementCost, 0);
  const steel = computedItems.find((item) => item.description.toLowerCase().includes("reinforcement"))?.amount || 0;
  const gst = tenderAmount * (Number(adjustments.gstPercent || 0) / 100);
  const costExcluding = Math.max(0, tenderAmount - royalty - cement - steel - gst);
  return { computedItems, tenderAmount, royalty, cement, steel, gst, costExcluding };
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [view, setView] = useState("dashboard");
  const [templates, setTemplates] = useState([]);
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [status, setStatus] = useState("Loading workspace...");
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarPinned, setSidebarPinned] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [templateRows, projectRows] = await Promise.all([api.templates(), api.projects()]);
      setTemplates(templateRows);
      setProjects(projectRows);
      const projectWithItems = projectRows.find((project) => (project.payload.items || []).length > 0);
      if (projectWithItems || projectRows[0]) {
        setActiveProject(projectWithItems || projectRows[0]);
      }
      setStatus(projectRows[0] ? "Ready" : "Create a project to begin");
    } catch (err) {
      setError(err.message);
      setStatus("Backend not ready");
    }
  }

  async function onLogin(event) {
    event.preventDefault();
    try {
      await api.login();
      setLoggedIn(true);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }

  async function createProject(templateId = "") {
    const template = templates.find((row) => String(row.id) === String(templateId));
    if (!template) {
      const draft = {
        id: null,
        isDraft: true,
        name: `Blank Estimate ${new Date().toLocaleDateString("en-IN")}`,
        work_type: "General",
        template_id: null,
        payload: {
          meta: {
            workType: "General",
            title: `Blank Estimate ${new Date().toLocaleDateString("en-IN")}`,
            subtitle: "",
            division: "",
            subdivision: "",
            preparedBy: "Executive Engineer",
          },
          adjustments: {
            gstPercent: 18,
            royaltyPercent: 10.28,
            cementRatePerMt: 0,
            steelRatePerMt: 0,
            labourComponentPercent: 33.24,
            materialComponentPercent: 53.72,
            fuelComponentPercent: 13.04,
          },
          items: [],
          leadStatement: [],
          leadCharges: [],
        },
      };
      setActiveProject(draft);
      setStatus("Blank draft created. Add items before saving.");
      setView("adjust");
      return;
    }
    const body = {
      name: `${template.work_type} Estimate ${new Date().toLocaleDateString("en-IN")}`,
      work_type: template.work_type,
      template_id: template.id,
    };
    const created = await api.createProject(body);
    const project = {
      id: created.id,
      name: body.name,
      work_type: body.work_type,
      template_id: body.template_id,
      payload: created.payload,
    };
    setProjects((rows) => [project, ...rows]);
    setActiveProject(project);
    setView("adjust");
  }

  async function saveProject(project = activeProject) {
    if (!project) return;
    if (!(project.payload.items || []).length) {
      setStatus("Add at least one item before saving.");
      return;
    }
    setStatus("Saving...");
    const body = {
      name: project.name,
      work_type: project.work_type,
      payload: project.payload,
    };
    if (project.id) {
      await api.updateProject(project.id, body);
      setProjects((rows) => rows.map((row) => (row.id === project.id ? project : row)));
    } else {
      const created = await api.createProject(body);
      project = { ...project, id: created.id, isDraft: false, payload: created.payload };
      setActiveProject(project);
      setProjects((rows) => [project, ...rows]);
    }
    setStatus("Saved");
    setView("report");
  }

  function openProject(project, nextView = "adjust") {
    setActiveProject(project);
    setView(nextView);
  }

  function printProject(project = activeProject) {
    if (project) {
      setActiveProject(project);
    }
    setView("report");
    window.setTimeout(() => window.print(), 250);
  }

  async function updateTemplate(id, body) {
    const updated = await api.updateTemplate(id, body);
    setTemplates((rows) => rows.map((row) => (row.id === id ? { ...row, ...body, payload: body.payload || row.payload } : row)));
    setStatus("Template saved");
    return updated;
  }

  async function deleteTemplate(id) {
    await api.deleteTemplate(id);
    setTemplates((rows) => rows.filter((row) => row.id !== id));
    setStatus("Template deleted");
  }

  function updatePayload(updater) {
    setActiveProject((project) => {
      if (!project) return project;
      const next = clone(project);
      updater(next.payload);
      next.name = next.payload.meta.title || next.name;
      return next;
    });
  }

  if (!loggedIn) {
    return <Login error={error} onLogin={onLogin} />;
  }

  return (
    <div className={clsx("app-shell", sidebarOpen ? "sidebar-expanded" : "sidebar-collapsed")}>
      <aside
        className="sidebar"
        onMouseEnter={() => window.innerWidth > 860 && setSidebarOpen(true)}
        onMouseLeave={() => window.innerWidth > 860 && !sidebarPinned && setSidebarOpen(false)}
      >
        <div className="brand">
          <Calculator size={24} />
          <div>
            <strong>Ninale Estimate</strong>
            <span>Construction costing</span>
          </div>
        </div>
        <nav>
          {nav.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => { setView(item.id); setSidebarOpen(false); }} title={item.label}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="pin-sidebar" onClick={() => setSidebarPinned((value) => !value)} title="Pin sidebar">
          <Wand2 size={18} />
          <span>{sidebarPinned ? "Auto hide off" : "Auto hide on"}</span>
        </button>
        <button className="logout" onClick={() => setLoggedIn(false)} title="Logout">
          <LogOut size={18} />
          <span>Logout</span>
        </button>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setSidebarOpen((open) => !open)} title="Toggle menu">
            <Menu size={19} />
          </button>
          <div>
            <h1>{activeProject?.payload?.meta?.title || "Estimate Workspace"}</h1>
            <p>{activeProject?.payload?.meta?.subtitle || status}</p>
          </div>
          <div className="top-actions">
            <button className="icon-button" onClick={() => saveProject()} title="Save project" disabled={!activeProject}>
              <Save size={18} />
            </button>
            <button className="icon-button" onClick={() => printProject()} title="Print current project report" disabled={!activeProject}>
              <Printer size={18} />
            </button>
          </div>
        </header>

        {error && <div className="alert">{error}</div>}
        {view === "dashboard" && <Dashboard activeProject={activeProject} projects={projects} templates={templates} onCreate={createProject} openProject={openProject} printProject={printProject} />}
        {view === "projects" && <Projects projects={projects} activeProject={activeProject} templates={templates} openProject={openProject} onCreate={createProject} printProject={printProject} />}
        {view === "adjust" && (
          <Adjustment project={activeProject} templates={templates} updatePayload={updatePayload} saveProject={saveProject} onCreate={createProject} />
        )}
        {view === "report" && <Report project={activeProject} onEdit={() => setView("adjust")} onPrint={() => printProject(activeProject)} />}
        {view === "rates" && <RateMaster project={activeProject} updatePayload={updatePayload} />}
        {view === "templates" && <Templates templates={templates} onCreate={createProject} updateTemplate={updateTemplate} deleteTemplate={deleteTemplate} />}
      </main>
    </div>
  );
}

function Login({ onLogin, error }) {
  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={onLogin}>
        <div className="login-mark">
          <Calculator size={30} />
        </div>
        <h1>Ninale Estimate</h1>
        <p>Bridge, road, KT weir, Kolhapuri bandhara and building estimate reports.</p>
        <label>
          User name
          <input defaultValue="admin" />
        </label>
        <label>
          Password
          <input type="password" defaultValue="admin" />
        </label>
        {error && <small>{error}</small>}
        <button type="submit">Login</button>
      </form>
    </main>
  );
}

function Dashboard({ activeProject, projects, templates, onCreate, openProject, printProject }) {
  const totals = activeProject ? calculate(activeProject.payload) : null;
  const categories = useMemo(() => {
    return templates.reduce((groups, template) => {
      const key = template.work_type || "Other";
      groups[key] = groups[key] || [];
      groups[key].push(template);
      return groups;
    }, {});
  }, [templates]);
  const recentProjects = projects.slice(0, 8);
  return (
    <section className="panel-grid">
      <Stat label="Projects" value={projects.length} />
      <Stat label="Templates" value={templates.length} />
      <Stat label="Active Tender Amount" value={totals ? `Rs. ${currency(totals.tenderAmount)}` : "Rs. 0"} />
      <Stat label="Items In Estimate" value={activeProject?.payload?.items?.length || 0} />
      <div className="wide-panel">
        <div className="section-title">
          <h2>Project Dashboard</h2>
          <CreateProjectMenu templates={templates} onCreate={onCreate} />
        </div>
        <div className="dashboard-projects">
          {recentProjects.map((project) => {
            const projectTotals = calculate(project.payload);
            return (
              <ProjectCard
                key={project.id}
                active={activeProject?.id === project.id}
                project={project}
                totals={projectTotals}
                openProject={openProject}
                printProject={printProject}
              />
            );
          })}
        </div>
      </div>
      <div className="wide-panel">
        <div className="section-title">
          <h2>Estimate Categories</h2>
        </div>
        <div className="category-grid">
          {Object.entries(categories).map(([category, rows], index) => (
            <motion.article
              className="category-card"
              key={category}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
            >
              <span>{rows.length} templates</span>
              <strong>{category}</strong>
              <p>{rows[0]?.description}</p>
              <button onClick={() => onCreate(rows[0]?.id)}><Plus size={15} /> Create {category}</button>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateProjectMenu({ templates, onCreate }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="create-menu">
      <button onClick={() => setOpen((value) => !value)}><Plus size={16} /> Create new project</button>
      {open && (
        <div className="create-popover">
          <button onClick={() => { onCreate(""); setOpen(false); }}>Start blank draft</button>
          {templates.map((template) => (
            <button key={template.id} onClick={() => { onCreate(template.id); setOpen(false); }}>
              <strong>{template.name}</strong>
              <span>{template.work_type}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, totals, active, openProject, printProject }) {
  return (
    <article className={clsx("project-card", active && "active-project")}>
      <div>
        <span className="project-type">{project.work_type}</span>
        <strong>{project.name}</strong>
        <small>{project.payload.items?.length || 0} items</small>
      </div>
      <b>Rs. {currency(totals.tenderAmount)}</b>
      <div className="row-actions">
        <button onClick={() => openProject(project, "adjust")}><Settings2 size={15} /> Edit</button>
        <button onClick={() => openProject(project, "report")}><FileText size={15} /> Report</button>
        <button onClick={() => printProject(project)}><Printer size={15} /> Print</button>
      </div>
    </article>
  );
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Projects({ projects, activeProject, templates, openProject, onCreate, printProject }) {
  return (
    <section className="surface">
      <div className="section-title">
        <h2>Projects</h2>
        <CreateProjectMenu templates={templates} onCreate={onCreate} />
      </div>
      <div className="project-list">
        {projects.map((project) => {
          const totals = calculate(project.payload);
          return (
            <ProjectCard key={project.id} active={activeProject?.id === project.id} project={project} totals={totals} openProject={openProject} printProject={printProject} />
          );
        })}
      </div>
    </section>
  );
}

function Adjustment({ project, updatePayload, saveProject, onCreate, templates }) {
  if (!project) {
    return <EmptyState templates={templates} onCreate={onCreate} />;
  }
  const payload = project.payload;
  const totals = calculate(payload);

  function updateMeta(field, value) {
    updatePayload((draft) => {
      draft.meta[field] = value;
    });
  }

  function updateAdjustment(field, value) {
    updatePayload((draft) => {
      draft.adjustments[field] = Number(value);
    });
  }

  function updateItem(index, field, value) {
    updatePayload((draft) => {
      draft.items[index][field] = field === "description" || field === "unit" ? value : Number(value);
    });
  }

  function addItem() {
    updatePayload((draft) => {
      const itemNo = (draft.items || []).length + 1;
      draft.items.push({
        itemNo,
        description: "New estimate item",
        rate: 0,
        unit: "Cum",
        quantity: 0,
        cementRate: 0,
        royaltyRate: 0,
        machineryRate: 0,
        labourRate: 0,
        polRate: 0,
        materialRate: 0,
        analysis: [],
      });
    });
  }

  return (
    <section className="editor">
        <div className="surface">
          <div className="section-title">
            <h2>Project Inputs</h2>
            <button onClick={() => saveProject()}><Save size={16} /> Save</button>
          </div>
          <div className="form-grid">
            <TextField label="Estimate title" value={payload.meta.title} onChange={(v) => updateMeta("title", v)} />
            <TextField label="Location / subtitle" value={payload.meta.subtitle} onChange={(v) => updateMeta("subtitle", v)} />
            <TextField label="Division" value={payload.meta.division} onChange={(v) => updateMeta("division", v)} />
            <TextField label="Sub division" value={payload.meta.subdivision} onChange={(v) => updateMeta("subdivision", v)} />
          </div>
        </div>

        <div className="surface">
          <h2>K Components & Global Adjustments</h2>
          <div className="number-grid">
            {Object.entries(payload.adjustments).map(([key, value]) => (
              <NumberField key={key} label={labelize(key)} value={value} onChange={(v) => updateAdjustment(key, v)} />
            ))}
          </div>
        </div>

        <div className="surface">
          <div className="section-title">
            <h2>Editable Estimate Table</h2>
            <button onClick={addItem}><Plus size={16} /> Item</button>
          </div>
          <div className="table-total-banner">
            <span>Total Estimate Amount</span>
            <strong>Rs. {currency(totals.tenderAmount)}</strong>
          </div>
          <EditableEstimateTable items={totals.computedItems} updateItem={updateItem} />
        </div>
    </section>
  );
}

function RateMaster({ project, updatePayload }) {
  if (!project) return <div className="surface"><h2>Rate Master</h2><p>Create or select a project first.</p></div>;
  function addRateItem() {
    updatePayload((draft) => {
      const itemNo = (draft.items || []).length + 1;
      draft.items.push({
        itemNo,
        description: "New rate master item",
        rate: 0,
        unit: "Cum",
        quantity: 1,
        cementRate: 0,
        royaltyRate: 0,
        machineryRate: 0,
        labourRate: 0,
        polRate: 0,
        materialRate: 0,
        analysis: [],
      });
    });
  }
  return (
    <section className="surface">
      <div className="section-title">
        <h2>Rate Master</h2>
        <button onClick={addRateItem}><Plus size={16} /> Add item</button>
      </div>
      <div className="rate-table">
        <div className="rate-head">
          <span>Item name</span><span>Rate</span><span>Cement</span><span>Royalty</span><span>Machinery</span><span>Labour</span><span>POL</span>
        </div>
        {project.payload.items.map((item, index) => (
          <div className="rate-row" key={index}>
            <input
              value={item.description}
              onChange={(event) => updatePayload((draft) => { draft.items[index].description = event.target.value; })}
            />
            {["rate", "cementRate", "royaltyRate", "machineryRate", "labourRate", "polRate"].map((field) => (
              <input
                key={field}
                type="number"
                value={item[field]}
                onChange={(event) => updatePayload((draft) => { draft.items[index][field] = Number(event.target.value); })}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Templates({ templates, onCreate, updateTemplate, deleteTemplate }) {
  const [selectedTemplateId, setSelectedTemplateId] = useState(templates[0]?.id || "");
  const [draft, setDraft] = useState(null);
  useEffect(() => {
    if (!selectedTemplateId && templates[0]?.id) {
      setSelectedTemplateId(templates[0].id);
    }
  }, [selectedTemplateId, templates]);
  const selected = templates.find((template) => String(template.id) === String(selectedTemplateId)) || templates[0];
  useEffect(() => {
    if (selected) {
      setDraft(clone(selected));
    }
  }, [selected?.id]);
  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  function updateDraftMeta(field, value) {
    setDraft((current) => {
      const next = clone(current);
      next.payload.meta[field] = value;
      return next;
    });
  }
  function saveDraft() {
    if (draft) {
      updateTemplate(draft.id, draft);
    }
  }
  function removeDraft() {
    if (draft && window.confirm(`Delete template "${draft.name}"?`)) {
      deleteTemplate(draft.id);
      setSelectedTemplateId("");
    }
  }
  return (
    <section className="surface">
      <div className="section-title">
        <h2>Templates</h2>
        <div className="template-picker">
          <select value={selectedTemplateId} onChange={(event) => setSelectedTemplateId(event.target.value)}>
            {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
          </select>
          <button onClick={() => onCreate(selectedTemplateId)}>Use selected template</button>
        </div>
      </div>
      {selected && (
        <div className="template-preview">
          <strong>{selected.name}</strong>
          <span>{selected.work_type} / {selected.payload.items?.length || 0} default items</span>
          <p>{selected.description}</p>
        </div>
      )}
      {draft && (
        <div className="template-edit">
          <h2>Edit Template</h2>
          <div className="form-grid">
            <TextField label="Template name" value={draft.name} onChange={(v) => updateDraft("name", v)} />
            <TextField label="Work type" value={draft.work_type} onChange={(v) => updateDraft("work_type", v)} />
            <TextField label="Description" value={draft.description} onChange={(v) => updateDraft("description", v)} textarea />
            <TextField label="Default report title" value={draft.payload.meta.title} onChange={(v) => updateDraftMeta("title", v)} />
          </div>
          <div className="inline-actions">
            <button onClick={saveDraft}><Save size={16} /> Save template</button>
            <button className="danger-button" onClick={removeDraft}>Delete template</button>
          </div>
        </div>
      )}
      <div className="template-grid">
        {templates.map((template) => (
          <article key={template.id}>
            <strong>{template.name}</strong>
            <span>{template.work_type} / {template.payload.items?.length || 0} items</span>
            <p>{template.description}</p>
            <button onClick={() => onCreate(template.id)}>Use template</button>
          </article>
        ))}
      </div>
    </section>
  );
}

function EmptyState({ templates, onCreate }) {
  return (
    <section className="surface empty">
      <h2>No project selected</h2>
      <p>Create an estimate from a ready template. Empty projects are not saved.</p>
      <div className="template-strip">
        {templates.map((template) => <button key={template.id} onClick={() => onCreate(template.id)}>{template.name}</button>)}
      </div>
    </section>
  );
}

function Report({ project, onEdit, onPrint }) {
  if (!project) return <EmptyReport />;
  const payload = project.payload;
  const totals = calculate(payload);
  const abstractPages = chunk(totals.computedItems, 8);
  const ratePages = chunk(totals.computedItems, 2);
  let pageNo = 1;
  const sections = [
    ["Cover", 1],
    ["Auto Index", 2],
    ["K1, K2, K3 Calculation", 3],
    ["Abstract Estimate", 4],
    ["Lead Statement", 4 + abstractPages.length],
    ["Material Statement", 5 + abstractPages.length],
    ["Escalation Component Statement", 6 + abstractPages.length],
    ["Rate Analysis", 7 + abstractPages.length],
    ["Estimate Summary", 7 + abstractPages.length + ratePages.length],
    ["Machinery / POL Lead Charges", 8 + abstractPages.length + ratePages.length],
  ];
  return (
    <section className="report-stack">
      <div className="report-toolbar">
        <button onClick={onEdit}><Settings2 size={16} /> Edit project values</button>
        <button onClick={onPrint}><Printer size={16} /> Print current report</button>
      </div>
      <ReportPage pageNo={pageNo++} className="cover-page">
        <div className="cover-k">
          <span>K1 {payload.adjustments.labourComponentPercent}</span>
          <span>K2 {payload.adjustments.materialComponentPercent}</span>
          <span>K3 {payload.adjustments.fuelComponentPercent}</span>
          <strong>100.00</strong>
        </div>
        <h1>K1, K2 & K3</h1>
        <p>of</p>
        <h2>{payload.meta.title}</h2>
        <h3>{payload.meta.subtitle}</h3>
        <footer>{payload.meta.preparedBy}<br />{payload.meta.division}</footer>
      </ReportPage>

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} accent="Index" />
        <h2 className="decorated-heading">Auto Index</h2>
        <table className="simple-table index-table">
          <thead><tr><th>Sr.</th><th>Section</th><th>Page</th></tr></thead>
          <tbody>
            {sections.map(([title, page], index) => <tr key={title}><td>{index + 1}</td><td>{title}</td><td>{page}</td></tr>)}
          </tbody>
        </table>
      </ReportPage>

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} />
        <h2 className="decorated-heading">Calculations of K1, K2, K3 (For Price Escalation)</h2>
        <KeyCalcTable payload={payload} totals={totals} />
        <SignatureBlock payload={payload} />
      </ReportPage>

      {abstractPages.map((items, index) => (
        <ReportPage pageNo={pageNo++} key={`abstract-${index}`} landscape>
          <ReportHeader payload={payload} />
          <h2 className="decorated-heading">Abstract Estimate</h2>
          <AbstractTable items={items} fit />
        </ReportPage>
      ))}

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} />
        <h2 className="decorated-heading">Lead Statement</h2>
        <LeadStatement rows={payload.leadStatement} />
      </ReportPage>

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} accent="Statement" />
        <h2 className="decorated-heading">Material Statement</h2>
        <MaterialStatement items={totals.computedItems} />
      </ReportPage>

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} accent="Components" />
        <h2 className="decorated-heading">Escalation Component Statement</h2>
        <ComponentStatement payload={payload} totals={totals} />
      </ReportPage>

      {ratePages.map((items, index) => (
        <ReportPage pageNo={pageNo++} key={`rate-${index}`}>
          <ReportHeader payload={payload} />
          <h2 className="decorated-heading">Rate Analysis</h2>
          {items.map((item) => <RateAnalysis item={item} key={item.itemNo} />)}
        </ReportPage>
      ))}

      <ReportPage pageNo={pageNo++}>
        <ReportHeader payload={payload} />
        <h2 className="decorated-heading">Estimate Summary</h2>
        <KeyCalcTable payload={payload} totals={totals} />
        <AbstractTable items={totals.computedItems.slice(-6)} fit />
        <SignatureBlock payload={payload} />
      </ReportPage>

      <ReportPage pageNo={pageNo++} landscape>
        <h2 className="decorated-heading">Machinery / POL Charges For Lead Charges Rs / Unit</h2>
        <LeadChargeTable rows={payload.leadCharges} />
      </ReportPage>
    </section>
  );
}

function MiniReport({ project, totals = calculate(project.payload) }) {
  const payload = project.payload;
  return (
    <div className="mini-report">
      <div>
        <span>Current report preview</span>
        <strong>{payload.meta.title}</strong>
      </div>
      <div className="mini-totals">
        <b>Rs. {currency(totals.tenderAmount)}</b>
        <span>GST Rs. {currency(totals.gst)} / Royalty Rs. {currency(totals.royalty)}</span>
      </div>
      <AbstractTable items={totals.computedItems.slice(0, 6)} compact />
    </div>
  );
}

function EditableEstimateTable({ items, updateItem }) {
  const numericFields = ["rate", "quantity", "cementRate", "royaltyRate", "machineryRate", "labourRate", "polRate"];
  const units = ["Cum", "/ Cum", "Sqm", "Rmt", "Nos", "MT", "Kg", "Hours", "Bag", "Litre", "Each", "Job"];
  return (
    <div className="editable-table-wrap">
      <table className="editable-estimate">
        <colgroup>
          <col className="col-no" />
          <col className="col-item" />
          <col className="col-rate" />
          <col className="col-unit" />
          <col className="col-qty" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
        </colgroup>
        <thead>
          <tr>
            <th>No</th><th>Item name</th><th>Rate</th><th>Unit</th><th>Qty</th><th>Amount</th><th>Cement</th><th>Royalty</th><th>Machine</th><th>Labour</th><th>POL</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.itemNo}>
              <td>{item.itemNo}</td>
              <td>
                <textarea value={item.description} title={item.description} onChange={(event) => updateItem(index, "description", event.target.value)} />
              </td>
              <td>
                <input type="number" step="0.01" value={item.rate ?? 0} onChange={(event) => updateItem(index, "rate", event.target.value)} />
              </td>
              <td>
                <select value={item.unit || "Cum"} onChange={(event) => updateItem(index, "unit", event.target.value)}>
                  {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </td>
              <td>
                <input type="number" step="0.01" value={item.quantity ?? 0} onChange={(event) => updateItem(index, "quantity", event.target.value)} />
              </td>
              <td className="readonly-cell money-cell">{currency(item.amount)}</td>
              {numericFields.slice(2).map((field) => (
                <td key={field}>
                  <input type="number" step="0.01" value={item[field] ?? 0} onChange={(event) => updateItem(index, field, event.target.value)} />
                </td>
              ))}
              <td className="readonly-cell money-cell">{currency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EmptyReport() {
  return <section className="surface empty"><h2>Report</h2><p>Select or create a project to view report pages.</p></section>;
}

function ReportPage({ children, pageNo, landscape = false, className = "" }) {
  return (
    <article className={`report-page ${landscape ? "landscape" : ""} ${className}`}>
      <div className="page-watermark">Ninale Estimate</div>
      <div className="report-content">{children}</div>
      <div className="page-number">Page {pageNo}</div>
    </article>
  );
}

function ReportHeader({ payload, accent = "Estimate" }) {
  return (
    <header className="report-header">
      <span>{accent}</span>
      <strong>{payload.meta.title}</strong>
      {payload.meta.subtitle && <small>{payload.meta.subtitle}</small>}
    </header>
  );
}

function KeyCalcTable({ payload, totals }) {
  const rows = [
    ["Amount of Tender", totals.tenderAmount],
    ["Cost of royalty", totals.royalty],
    [`GST (${payload.adjustments.gstPercent}%)`, totals.gst],
    ["Cost of Cement", totals.cement],
    ["Cost of H.Y.S.D. Steel", totals.steel],
    ["Cost excluding royalty, Cement, Steel", totals.costExcluding],
    ["Labour component K1 %", payload.adjustments.labourComponentPercent],
    ["Material component K2 %", payload.adjustments.materialComponentPercent],
    ["Fuel component K3 %", payload.adjustments.fuelComponentPercent],
    ["Rate of Cement per M.T.", payload.adjustments.cementRatePerMt || "as per actual"],
    ["Rate of H.Y.S.D. Steel per M.T.", payload.adjustments.steelRatePerMt || "as per actual"],
  ];
  return <SimpleTable rows={rows} />;
}

function SimpleTable({ rows }) {
  return (
    <table className="simple-table">
      <tbody>
        {rows.map(([label, value], index) => (
          <tr key={index}><td>{index + 1}</td><td>{label}</td><td>Rs.</td><td>{typeof value === "number" ? currency(value) : value}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function AbstractTable({ items, compact = false, fit = false }) {
  return (
    <div className={fit ? "table-fit" : "table-scroll"}>
      <table className={compact ? "abstract compact-table" : "abstract"}>
        <colgroup>
          <col className="col-no" />
          <col className="col-item" />
          <col className="col-rate" />
          <col className="col-unit" />
          <col className="col-qty" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
          <col className="col-money" />
        </colgroup>
        <thead>
          <tr>
            <th>No</th><th>Item</th><th>Rate</th><th>Unit</th><th>Qty</th><th>Amount</th><th>Cement</th><th>Royalty</th><th>Machine</th><th>Labour</th><th>POL</th><th>Total</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.itemNo}>
              <td>{item.itemNo}</td>
              <td>{item.description}</td>
              <td>{currency(item.rate)}</td>
              <td>{item.unit}</td>
              <td>{currency(item.quantity)}</td>
              <td>{currency(item.amount)}</td>
              <td>{currency(item.cementCost)}</td>
              <td>{currency(item.royaltyCost)}</td>
              <td>{currency(item.machineryCost)}</td>
              <td>{currency(item.labourAmount)}</td>
              <td>{currency(item.polAmount)}</td>
              <td>{currency(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadStatement({ rows = [] }) {
  return (
    <table className="simple-table">
      <thead><tr><th>Sr.</th><th>Material</th><th>Distance</th><th>Source</th><th>Lead Charges</th><th>Unit</th><th>Reference</th></tr></thead>
      <tbody>
        {rows.map((row, index) => (
          <tr key={index}><td>{index + 1}</td><td>{row.material}</td><td>{row.distanceKm}</td><td>{row.source}</td><td>{currency(row.leadCharge)}</td><td>{row.unit}</td><td>{row.reference}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

function LeadChargeTable({ rows = [] }) {
  return (
    <table className="simple-table">
      <thead><tr><th>Lead Km</th><th>Rubble</th><th>Sand/Metal below 40mm</th><th>Steel</th><th>Cement</th><th>Murum/Metal above 40mm</th></tr></thead>
      <tbody>
        {rows.map((row) => <tr key={row.leadKm}><td>{row.leadKm}</td><td>{row.rubble}</td><td>{row.sandMetal}</td><td>{row.steel}</td><td>{row.cement}</td><td>{row.murum}</td></tr>)}
      </tbody>
    </table>
  );
}

function MaterialStatement({ items }) {
  const rows = [
    ["Cement component", items.reduce((sum, item) => sum + item.cementCost, 0)],
    ["Royalty component", items.reduce((sum, item) => sum + item.royaltyCost, 0)],
    ["Machinery component", items.reduce((sum, item) => sum + item.machineryCost, 0)],
    ["Labour component", items.reduce((sum, item) => sum + item.labourAmount, 0)],
    ["POL component", items.reduce((sum, item) => sum + item.polAmount, 0)],
    ["Material excluding above", items.reduce((sum, item) => sum + item.materialAmount, 0)],
  ];
  return <SimpleTable rows={rows} />;
}

function ComponentStatement({ payload, totals }) {
  const rows = [
    ["K1 Labour component", `${payload.adjustments.labourComponentPercent}%`],
    ["K2 Material component", `${payload.adjustments.materialComponentPercent}%`],
    ["K3 Fuel component", `${payload.adjustments.fuelComponentPercent}%`],
    ["Tender amount considered", totals.tenderAmount],
    ["Cost excluding royalty, cement, steel and GST", totals.costExcluding],
    ["GST provision", totals.gst],
  ];
  return <SimpleTable rows={rows} />;
}

function RateAnalysis({ item }) {
  return (
    <div className="rate-analysis">
      <h3>Item No.{item.itemNo} :-</h3>
      <p>{item.description}</p>
      <table className="simple-table">
        <thead><tr><th>Particular</th><th>Unit</th><th>Labour</th><th>Material</th><th>POL</th><th>Machinery</th><th>Cement</th><th>Amount</th></tr></thead>
        <tbody>
          {(item.analysis || []).map((row, index) => (
            <tr key={index}>
              <td>{row.particular}</td><td>{item.unit}</td><td>{currency(item.labourRate)}</td><td>{currency(item.materialRate)}</td><td>{currency(item.polRate)}</td><td>{currency(item.machineryRate)}</td><td>{currency(item.cementRate)}</td><td>{currency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignatureBlock({ payload }) {
  return (
    <div className="signatures">
      <span>Junior Engineer<br />{payload.meta.subdivision}</span>
      <span>Sub Divisional Engineer<br />{payload.meta.subdivision}</span>
      <span>Executive Engineer<br />{payload.meta.division}</span>
    </div>
  );
}

function TextField({ label, value, onChange, textarea = false }) {
  return (
    <label className="field">
      <span>{label}</span>
      {textarea ? <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} /> : <input value={value || ""} onChange={(e) => onChange(e.target.value)} />}
    </label>
  );
}

function NumberField({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" step="0.01" value={value ?? 0} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function labelize(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase());
}

function chunk(rows, size) {
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

const rootElement = document.getElementById("root");
const appRoot = window.__NINALE_ROOT__ || createRoot(rootElement);
window.__NINALE_ROOT__ = appRoot;
appRoot.render(<App />);
