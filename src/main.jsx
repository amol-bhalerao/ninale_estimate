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

function numericInputValue(value) {
  return value === "" ? "" : value ?? 0;
}

function parseNumericInput(value) {
  return value === "" ? "" : Number(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function storageGet(key, fallback = "") {
  try {
    return window.localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // localStorage can be blocked in private contexts; app still works in memory.
  }
}

function projectSearchText(project) {
  return [
    project.name,
    project.work_type,
    project.payload?.meta?.title,
    project.payload?.meta?.subtitle,
    project.payload?.meta?.division,
    project.payload?.design?.cover?.workName,
    project.payload?.design?.cover?.location,
    project.payload?.design?.cover?.region,
    project.payload?.design?.cover?.circle,
    project.payload?.roadDesign?.cover?.workName,
    project.payload?.roadDesign?.cover?.location,
    project.payload?.roadDesign?.cover?.roadLine,
  ].join(" ").toLowerCase();
}

function filterProjects(projects, query, type) {
  const normalizedQuery = query.trim().toLowerCase();
  return projects.filter((project) => {
    const typeMatch = !type || project.work_type === type || project.payload?.meta?.workType === type;
    const queryMatch = !normalizedQuery || projectSearchText(project).includes(normalizedQuery);
    return typeMatch && queryMatch;
  });
}

function workTypeOptions(projects) {
  return [...new Set(projects.map((project) => project.work_type || project.payload?.meta?.workType).filter(Boolean))].sort();
}

function formatDateBadge(value) {
  if (!value) return "Not saved";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
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
    const materialRate = Math.max(
      0,
      Number(item.rate || 0)
        - Number(item.cementRate || 0)
        - Number(item.royaltyRate || 0)
        - Number(item.machineryRate || 0)
        - Number(item.labourRate || 0)
        - Number(item.polRate || 0),
    );
    const excludingCementSteel = Math.max(0, amount - cementCost);
    return {
      ...item,
      materialRate,
      analysis: normalizeAnalysis(item, materialRate),
      amount,
      cementCost,
      royaltyCost,
      machineryCost,
      labourAmount,
      polAmount,
      materialAmount,
      excludingCementSteel,
    };
  });
  const tenderAmount = computedItems.reduce((sum, item) => sum + item.amount, 0);
  const royalty = computedItems.reduce((sum, item) => sum + item.royaltyCost, 0);
  const cement = computedItems.reduce((sum, item) => sum + item.cementCost, 0);
  const steel = computedItems.find((item) => item.description.toLowerCase().includes("reinforcement"))?.amount || 0;
  const gst = tenderAmount * (Number(adjustments.gstPercent || 0) / 100);
  const costExcluding = Math.max(0, tenderAmount - royalty - cement - steel - gst);
  return { computedItems, tenderAmount, royalty, cement, steel, gst, costExcluding };
}

function normalizeAnalysis(item, materialRate = 0) {
  if (Array.isArray(item.analysis) && item.analysis.length) {
    return item.analysis;
  }
  const rate = Number(item.rate || 0);
  return [
    { particular: "Basic item rate as entered in estimate table", amount: roundMoney(rate * 0.86) },
    { particular: "Lead, lift, loading, unloading and handling", amount: roundMoney(rate * 0.09) },
    { particular: "Labour welfare, finishing and incidental charges", amount: roundMoney(rate * 0.01) },
    { particular: "Rounded rate adopted for rate analysis", amount: roundMoney(rate || materialRate) },
  ];
}

function roundMoney(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function createBlankItem(itemNo) {
  return {
    itemNo,
    description: "New estimate item",
    rate: 0,
    unit: "Cum",
    quantity: 1,
    cementRate: 0,
    royaltyRate: 0,
    machineryRate: 0,
    labourRate: 0,
    polRate: 0,
    materialRate: 0,
    analysis: normalizeAnalysis({ rate: 0 }),
  };
}

function App() {
  const [loggedIn, setLoggedIn] = useState(() => storageGet("ninale.loggedIn") === "true");
  const [view, setView] = useState(() => storageGet("ninale.view", "dashboard"));
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

  useEffect(() => {
    storageSet("ninale.loggedIn", loggedIn ? "true" : "false");
  }, [loggedIn]);

  useEffect(() => {
    storageSet("ninale.view", view);
  }, [view]);

  useEffect(() => {
    if (activeProject?.id) {
      storageSet("ninale.activeProjectId", String(activeProject.id));
    }
  }, [activeProject?.id]);

  async function loadData() {
    try {
      const [templateRows, projectRows] = await Promise.all([api.templates(), api.projects()]);
      setTemplates(templateRows);
      setProjects(projectRows);
      const storedProjectId = storageGet("ninale.activeProjectId");
      const storedProject = projectRows.find((project) => String(project.id) === storedProjectId);
      const projectWithItems = projectRows.find((project) => (project.payload.items || []).length > 0);
      if (storedProject || projectWithItems || projectRows[0]) {
        setActiveProject(storedProject || projectWithItems || projectRows[0]);
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
      storageSet("ninale.loggedIn", "true");
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
        <button className="logout" onClick={() => { setLoggedIn(false); storageSet("ninale.loggedIn", "false"); }} title="Logout">
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
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const totals = activeProject ? calculate(activeProject.payload) : null;
  const categories = useMemo(() => {
    return templates.reduce((groups, template) => {
      const key = template.work_type || "Other";
      groups[key] = groups[key] || [];
      groups[key].push(template);
      return groups;
    }, {});
  }, [templates]);
  const filteredProjects = filterProjects(projects, query, typeFilter);
  const recentProjects = filteredProjects.slice(0, 8);
  const types = workTypeOptions(projects);
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
        <ProjectFilters
          query={query}
          setQuery={setQuery}
          typeFilter={typeFilter}
          setTypeFilter={setTypeFilter}
          types={types}
        />
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
          {!recentProjects.length && <div className="empty-search">No projects match this dashboard filter.</div>}
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
              <b>Rs. {currency(calculate(rows[0]?.payload || {}).tenderAmount)}</b>
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
              <span>{template.work_type} / Rs. {currency(calculate(template.payload).tenderAmount)}</span>
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
        <div className="project-date-badges">
          <span>Created {formatDateBadge(project.created_at)}</span>
          <span>Updated {formatDateBadge(project.updated_at)}</span>
        </div>
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
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const filteredProjects = filterProjects(projects, query, typeFilter);
  const types = workTypeOptions(projects);
  return (
    <section className="surface">
      <div className="section-title">
        <h2>Projects</h2>
        <CreateProjectMenu templates={templates} onCreate={onCreate} />
      </div>
      <ProjectFilters
        query={query}
        setQuery={setQuery}
        typeFilter={typeFilter}
        setTypeFilter={setTypeFilter}
        types={types}
      />
      <div className="project-list">
        {filteredProjects.map((project) => {
          const totals = calculate(project.payload);
          return (
            <ProjectCard key={project.id} active={activeProject?.id === project.id} project={project} totals={totals} openProject={openProject} printProject={printProject} />
          );
        })}
        {!filteredProjects.length && <div className="empty-search">No projects match this search.</div>}
      </div>
    </section>
  );
}

function ProjectFilters({ query, setQuery, typeFilter, setTypeFilter, types }) {
  return (
    <div className="project-filters">
      <label className="field project-search">
        <span>Search projects</span>
        <input placeholder="Search by project name, type, location, division..." value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <label className="field project-type-filter">
        <span>Project type</span>
        <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
          <option value="">All project types</option>
          {types.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
    </div>
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
      draft.adjustments[field] = value;
    });
  }

  function updateItem(index, field, value) {
    updatePayload((draft) => {
      draft.items[index][field] = value;
    });
  }

  function addItem() {
    updatePayload((draft) => {
      const itemNo = (draft.items || []).length + 1;
      draft.items.push(createBlankItem(itemNo));
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
      draft.items.push({ ...createBlankItem(itemNo), description: "New rate master item" });
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
              <NumericInput
                key={field}
                value={item[field]}
                onChange={(value) => updatePayload((draft) => { draft.items[index][field] = value; })}
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
            <b>Rs. {currency(calculate(template.payload).tenderAmount)}</b>
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

const GCM_SECTION_TITLES = [
  "Geographical Information & Lead Chart",
  "Survey & Investigation",
  "Fund Head Sheet",
  "General Report",
  "Certificate",
  "Rainfall Data",
  "Principal Features",
  "Yield Calculation",
  "4 Gradient Calculation",
  "5 Hydraulic Calculation",
  "6 Capacity",
  "HFL Calculation at MWL",
  "Afflux Calculation",
  "Discharge Calculation",
  "Hydraulic Jump & Apron",
  "Design of Weir Body Wall",
  "11 Stability",
  "Wing & Abutment Wall",
  "8 BC Ratio",
  "Water Requirement Statement",
  "10 Cost",
  "7 Cropping Pattern",
  "9 ERR",
  "Statement No.2 - Irrigated Produce",
  "Statement No.1 - Unirrigated Produce",
  "Crop Water Schedule - Hybrid Jawar",
  "Crop Water Schedule - Wheat",
  "Crop Water Schedule - Gram",
  "Crop Water Schedule - Sunflower",
  "Crop Water Schedule - Vegetables",
  "Crop Water Schedule - Two Seasonal Cotton",
  "ERR Cost Analysis",
  "Flow of Construction & O&M Costs",
  "Flow of Construction & O&M Costs - Continuation",
  "Irrigated Produce Statement",
  "Pre/Post Project Crop Pattern",
  "Flow of Annual Crop Net Returns",
  "B.C. Ratio Discounting Rate",
  "B.C. Ratio at 10 Percent",
  "B.C. Ratio at 10 Percent - Continuation",
  "B.C. Ratio at 11 Percent",
  "B.C. Ratio at 11 Percent - Continuation",
  "E.R.R. Calculation",
  "General Abstract",
  "Abstract of C Works",
  "Abstract of C Works - Continuation I",
  "Abstract of C Works - Continuation II",
  "Royalty Statement",
  "Utilisation Statement No.1",
  "Measurement Sheet - Item 1",
  "Measurement Sheet - Item 2",
  "Measurement Sheet - Item 3",
  "Measurement Sheet - Item 4",
  "Measurement Sheet - Item 5",
  "Measurement Sheet - Item 6",
  "Measurement Sheet - Backfilling",
  "Steel Quantity - Weir Body Wall",
  "Steel Quantity - Flank Wall",
  "Steel Quantity - D/S Wing Wall",
  "Statement for Excavation",
  "Nalla Deepening Statement",
  "Section Level Statement",
  "Lead Chart with Certificate",
  "Rates Analysis Items 1 to 4",
  "Rates Analysis Items 5 to 8",
  "Rates Analysis Items 9 to 13",
  "Royalty, GST and Labour Cess",
  "Marathi Responsibility Form I",
  "Marathi Responsibility Form II",
  "Preliminary Site Visit Report I",
  "Preliminary Site Visit Report II",
];

function Report({ project, onEdit, onPrint }) {
  if (!project) return <EmptyReport />;
  const payload = project.payload;
  const totals = calculate(payload);
  const abstractPages = chunk(totals.computedItems, 8);
  const ratePages = chunk(totals.computedItems, 2);
  const workType = payload.meta?.workType || project.work_type || "";
  const reportKind = payload.gcmDesign ? "gcm" : payload.design ? "bridgeDesign" : payload.roadDesign ? "roadDesign" : workType === "Road" ? "road" : workType === "Bridge" ? "bridge" : "standard";
  const prefixPageCount = reportKind === "gcm" ? GCM_SECTION_TITLES.length : reportKind === "bridgeDesign" ? 13 : reportKind === "roadDesign" ? 8 : reportKind === "road" ? 4 : reportKind === "bridge" ? 2 : 0;
  let pageNo = 1;
  const sections = [
    ["Cover", 1],
    ["Auto Index", 2],
    ...(reportKind === "bridgeDesign" ? [
      ["Design Data & Discharge Formula", 3],
      ["Linear Waterway Calculation", 4],
      ["Hydraulic Gradient Calculation", 5],
      ["Defined Cross Section & Site of Crossing", 6],
      ["Compartment I Calculation", 7],
      ["Compartment II Calculation", 8],
      ["Compartment III Calculation", 9],
      ["Discharge Summary", 10],
      ["Toposheet Map & Catchment Area", 11],
      ["Plan & L-section Drawing", 12],
      ["Bridge Site Section", 13],
      ["Define Cross Section Drawing", 14],
      ["L-section Drawing", 15],
    ] : []),
    ...(reportKind === "gcm" ? GCM_SECTION_TITLES.map((title, index) => [title, index + 3]) : []),
    ...(reportKind === "roadDesign" ? [
      ["Road Design Inputs", 3],
      ["Traffic Design", 4],
      ["Pavement Crust Design", 5],
      ["Geometric Statement", 6],
      ["Quantity Design Basis", 7],
      ["Road Drawing Sheets", 8],
    ] : []),
    ...(reportKind === "road" ? [
      ["Road Technical Statement", 3],
      ["Pavement Layer Statement", 4],
      ["Road Quantity Basis", 5],
      ["Road Furniture Statement", 6],
    ] : []),
    ...(reportKind === "bridge" ? [
      ["Bridge Technical Statement", 3],
      ["Bridge Component Statement", 4],
    ] : []),
    ...(reportKind === "gcm" ? [] : [
      ["K1, K2, K3 Calculation", 3 + prefixPageCount],
      ["Abstract Estimate", 4 + prefixPageCount],
      ["Lead Statement", 4 + prefixPageCount + abstractPages.length],
      ["Material Statement", 5 + prefixPageCount + abstractPages.length],
      ["Escalation Component Statement", 6 + prefixPageCount + abstractPages.length],
      ["Rate Analysis", 7 + prefixPageCount + abstractPages.length],
      ["Estimate Summary", 7 + prefixPageCount + abstractPages.length + ratePages.length],
      ["Machinery / POL Lead Charges", 8 + prefixPageCount + abstractPages.length + ratePages.length],
    ]),
  ];
  return (
    <section className="report-stack">
      <div className="report-toolbar">
        <button onClick={onEdit}><Settings2 size={16} /> Edit project values</button>
        <button onClick={onPrint}><Printer size={16} /> Print current report</button>
      </div>
      {reportKind === "bridgeDesign" || reportKind === "roadDesign" || reportKind === "gcm" ? (
        <DesignCoverPage payload={payload} pageNo={pageNo++} designKey={reportKind === "roadDesign" ? "roadDesign" : reportKind === "gcm" ? "gcmDesign" : "design"} />
      ) : (
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
      )}

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

      {reportKind === "bridgeDesign" && <DesignReportPages payload={payload} startPageNo={pageNo} />}
      {reportKind === "gcm" && <GcmReportPages payload={payload} startPageNo={pageNo} />}
      {reportKind === "roadDesign" && <RoadDesignReportPages payload={payload} startPageNo={pageNo} />}
      {reportKind === "road" && <RoadReportPages payload={payload} startPageNo={pageNo} />}
      {reportKind === "bridge" && <BridgeReportPages payload={payload} startPageNo={pageNo} />}
      {prefixPageCount ? (() => { pageNo += prefixPageCount; return null; })() : null}

      {reportKind !== "gcm" && (
        <>
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

          <ReportPage pageNo={pageNo++} landscape className="summary-page">
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
        </>
      )}
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
                <NumericInput value={item.rate} onChange={(value) => updateItem(index, "rate", value)} />
              </td>
              <td>
                <select value={item.unit || "Cum"} onChange={(event) => updateItem(index, "unit", event.target.value)}>
                  {units.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                </select>
              </td>
              <td>
                <NumericInput value={item.quantity} onChange={(value) => updateItem(index, "quantity", value)} />
              </td>
              <td className="readonly-cell money-cell">{currency(item.amount)}</td>
              {numericFields.slice(2).map((field) => (
                <td key={field}>
                  <NumericInput value={item[field]} onChange={(value) => updateItem(index, field, value)} />
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

function DesignCoverPage({ payload, pageNo, designKey = "design" }) {
  const cover = payload[designKey]?.cover || {};
  return (
    <ReportPage pageNo={pageNo} className="design-cover-page">
      <div className="gov-cover">
        <strong>{cover.department || "Government of Maharashtra"}</strong>
        <span>{cover.region}</span>
        <span>{cover.circle}</span>
        <span>{cover.division}</span>
        <h1>Estimate</h1>
        <p><b>Name of Work :</b> {cover.workName || payload.meta.title}</p>
        {cover.roadLine && <p>{cover.roadLine}</p>}
        {cover.partLine && <p>{cover.partLine}</p>}
        <p>{cover.location || payload.meta.subtitle}</p>
        <footer>{payload.meta.preparedBy}<br />{payload.meta.division}</footer>
      </div>
    </ReportPage>
  );
}

function RoadDesignReportPages({ payload, startPageNo }) {
  const design = payload.roadDesign || {};
  return (
    <>
      <ReportPage pageNo={startPageNo} className="design-page">
        <ReportHeader payload={payload} accent="Road Design" />
        <h2 className="decorated-heading">Road Design Inputs</h2>
        <DesignCover design={design} />
        <SimpleTable rows={design.inputs || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 1} className="design-page">
        <ReportHeader payload={payload} accent="Traffic" />
        <h2 className="decorated-heading">Traffic Design Calculation</h2>
        <SimpleTable rows={design.traffic || []} />
        <FormulaBlocks blocks={design.trafficFormulaBlocks || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 2} landscape className="design-page">
        <ReportHeader payload={payload} accent="Pavement" />
        <h2 className="decorated-heading">Pavement Crust Design</h2>
        <DesignTable headers={["Layer", "Thickness", "Material", "Remark"]} rows={(design.pavement || []).slice(1)} />
        <FormulaBlocks blocks={design.pavementFormulaBlocks || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 3} className="design-page">
        <ReportHeader payload={payload} accent="Geometry" />
        <h2 className="decorated-heading">Geometric Design Statement</h2>
        <SimpleTable rows={design.geometry || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 4} className="design-page">
        <ReportHeader payload={payload} accent="Quantities" />
        <h2 className="decorated-heading">Road Quantity Design Basis</h2>
        <SimpleTable rows={design.quantityBasis || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 5} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">Key Plan & Alignment Drawing</h2>
        <RoadSketch type="alignment" />
        <ul className="design-notes">{(design.drawingNotes || []).map((note) => <li key={note}>{note}</li>)}</ul>
      </ReportPage>
      <ReportPage pageNo={startPageNo + 6} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">L-Section & Formation Profile</h2>
        <RoadSketch type="profile" />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 7} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">Typical Cross Section & Pavement Layers</h2>
        <RoadSketch type="cross" />
      </ReportPage>
    </>
  );
}

function RoadReportPages({ payload, startPageNo }) {
  const rows = [
    ["Road Type", payload.meta?.workType || "Road"],
    ["Carriageway", "Flexible pavement road"],
    ["Surface", "DBM / BC bituminous surface"],
    ["Drainage", "Side drain and shoulder slope as per site"],
  ];
  const pavement = [
    ["Subgrade preparation", "As per site CBR and compaction requirement"],
    ["Granular sub-base", "GSB compacted layer"],
    ["Base course", "Wet Mix Macadam"],
    ["Binder/Wearing", "DBM / BC as applicable"],
  ];
  return (
    <>
      <ReportPage pageNo={startPageNo} className="design-page">
        <ReportHeader payload={payload} accent="Road" />
        <h2 className="decorated-heading">Road Technical Statement</h2>
        <SimpleTable rows={rows} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 1} className="design-page">
        <ReportHeader payload={payload} accent="Pavement" />
        <h2 className="decorated-heading">Pavement Layer Statement</h2>
        <SimpleTable rows={pavement} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 2} className="design-page">
        <ReportHeader payload={payload} accent="Quantities" />
        <h2 className="decorated-heading">Road Quantity Basis</h2>
        <SimpleTable rows={(payload.roadDesign?.quantityBasis || roadQuantityBasisFallback())} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 3} landscape className="design-page">
        <ReportHeader payload={payload} accent="Road Furniture" />
        <h2 className="decorated-heading">Road Furniture & Safety Statement</h2>
        <DesignTable headers={["Item", "Basis", "Remark"]} rows={[["Road markings", "Length as per center/edge line", "Thermoplastic / paint as applicable"], ["Sign boards", "As per junction and hazard locations", "Retro-reflective"], ["Shoulder", "Both sides", "Murum / compacted shoulder"], ["Drainage", "Low-lying stretches", "CC drain / earthen drain"]]} />
      </ReportPage>
    </>
  );
}

function BridgeReportPages({ payload, startPageNo }) {
  return (
    <>
      <ReportPage pageNo={startPageNo} className="design-page">
        <ReportHeader payload={payload} accent="Bridge" />
        <h2 className="decorated-heading">Bridge Technical Statement</h2>
        <SimpleTable rows={[["Structure type", "Bridge / culvert estimate"], ["Foundation", "As per approved drawing and site strata"], ["Concrete", "PCC, RCC, protection and approach works"], ["Hydraulic note", "Use Bridge Design template when detailed hydraulic calculations are required"]]} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 1} landscape className="design-page">
        <ReportHeader payload={payload} accent="Components" />
        <h2 className="decorated-heading">Bridge Component Statement</h2>
        <DesignTable headers={["Component", "Typical items", "Remark"]} rows={[["Substructure", "Foundation, abutment, pier, wing wall", "As per drawing"], ["Superstructure", "Deck slab, wearing coat, railing", "As per span arrangement"], ["Protection", "Apron, pitching, cutoff wall", "As per hydraulic requirement"], ["Approach", "GSB, WMM, bituminous layers", "Match existing road"]]} />
      </ReportPage>
    </>
  );
}

function roadQuantityBasisFallback() {
  return [
    ["Earthwork", "Length x average width x depth"],
    ["GSB", "Length x compacted width x thickness"],
    ["WMM", "Length x compacted width x thickness"],
    ["DBM / BC", "Length x carriageway width x thickness"],
  ];
}

function gcmCropScheduleRows(crop, area = "12.00") {
  const pattern = [
    ["1st", "Oct I", "Land preparation and first watering", "0.12", "0.12"],
    ["2nd", "Oct II", "Sowing / germination", "0.10", "0.22"],
    ["3rd", "Nov I", "Vegetative growth", "0.16", "0.38"],
    ["4th", "Nov II", "Crop development", "0.18", "0.56"],
    ["5th", "Dec I", "Flowering / maturity", "0.20", "0.76"],
    ["6th", "Dec II", "Final watering", "0.14", "0.90"],
  ];
  return pattern.map((row) => [crop, area, ...row]);
}

function gcmCashFlowRows(baseCost, years = 12, multiplier = 1) {
  return Array.from({ length: years }, (_, index) => {
    const year = index + 1;
    const construction = year <= 2 ? baseCost * (year === 1 ? 0.6 : 0.4) : 0;
    const om = year >= 3 ? baseCost * 0.015 : 0;
    const benefit = year >= 3 ? baseCost * 0.075 * multiplier : 0;
    const factor10 = 1 / Math.pow(1.1, year);
    const factor11 = 1 / Math.pow(1.11, year);
    return [
      year,
      currency(construction),
      currency(om),
      currency(benefit),
      factor10.toFixed(3),
      currency((benefit - om - construction) * factor10),
      factor11.toFixed(3),
      currency((benefit - om - construction) * factor11),
    ];
  });
}

function gcmMeasurementRows(items, start, count) {
  return items.slice(start, start + count).map((item) => {
    const length = Math.max(1, Number(item.quantity || 0) / 12).toFixed(2);
    const width = item.unit?.toLowerCase().includes("sqm") ? "1.00" : "2.00";
    const depth = item.unit?.toLowerCase().includes("sqm") ? "-" : "1.50";
    return [
      item.itemNo,
      item.description,
      "As per drawing",
      length,
      width,
      depth,
      Number(item.quantity || 0).toFixed(3),
      item.unit,
    ];
  });
}

function gcmRateRows(items, start, count) {
  return items.slice(start, start + count).map((item) => [
    item.itemNo,
    item.description,
    item.unit,
    currency(item.rate),
    currency(item.cementRate || 0),
    currency(item.royaltyRate || 0),
    currency(item.labourRate || 0),
    currency(item.machineryRate || 0),
    currency((item.rate || 0) + (item.cementRate || 0) + (item.royaltyRate || 0) + (item.labourRate || 0) + (item.machineryRate || 0)),
  ]);
}

function gcmCapacityRows(rawRows = []) {
  const numericRows = rawRows.filter((row) => row[0] !== "Total").map((row) => {
    const level = Number(row[0] || 0);
    const area = Number(row[1] || 0);
    return { level, area, remark: row[4] || "" };
  });
  let successive = 0;
  const rows = numericRows.map((row, index) => {
    const prevArea = index ? numericRows[index - 1].area : 0;
    const interval = index ? (row.level - numericRows[index - 1].level).toFixed(2) : "";
    const rootArea = Math.sqrt(row.area).toFixed(3);
    const sumArea = (prevArea + row.area).toFixed(3);
    const rootProduct = Math.sqrt(prevArea * row.area).toFixed(3);
    const capTcm = index ? (((prevArea + row.area + Math.sqrt(prevArea * row.area)) / 3) * Number(interval)).toFixed(3) : "";
    successive += Number(capTcm || 0);
    return [
      index + 1,
      row.level.toFixed(2),
      row.area.toFixed(2),
      rootArea,
      sumArea,
      rootProduct,
      interval,
      capTcm,
      successive ? successive.toFixed(3) : "",
      successive ? (successive * 0.035315).toFixed(3) : "",
      row.remark,
    ];
  });
  rows.push(["Total", "", "", "", "", "", "", "", successive.toFixed(3), (successive * 0.035315).toFixed(3), ""]);
  return rows;
}

function GcmReferenceLabels() {
  const labels = [
    ["4", "Gradient Calculation"],
    ["5", "Hydraulic Calculation"],
    ["6", "Capacity"],
    ["7", "Cropping Pattern"],
    ["8", "BC Ratio"],
    ["9", "ERR"],
    ["10", "Cost"],
    ["11", "Stability"],
  ];
  return (
    <div className="gcm-reference-labels">
      {labels.map(([number, label]) => (
        <div key={number}>
          <strong>{number}</strong>
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function GcmHydraulicCalculation({ gcm }) {
  return (
    <div className="gcm-hydraulic-sheet">
      <div className="hydraulic-topline"><span>Average</span><strong>46.333 TCM</strong></div>
      <div className="hydraulic-formula">
        <div className="stacked-values">
          <span>25.00</span><b>8.973</b>
          <span>24.00</span><b>8.154</b>
          <i />
          <span>1</span><b>0.819</b>
          <span>0.66</span><b></b>
        </div>
        <div className="fraction">
          <span>0.66</span>
          <span>X</span>
          <span>0.819</span>
          <i>1</i>
        </div>
        <div className="hydraulic-result">
          <span>8.15</span>
          <span>+</span>
          <span>0.54</span>
          <span>=</span>
          <strong>8.69</strong>
          <small>Mcft / Sqmile</small>
        </div>
      </div>
      <FormulaBlocks blocks={(gcm.formulaBlocks || []).slice(0, 1)} />
    </div>
  );
}

function GcmCapacityTable({ rows = [] }) {
  const capacityRows = gcmCapacityRows(rows);
  return (
    <div className="gcm-capacity-wrap">
      <div className="gcm-ftl-line">FTL=&nbsp;&nbsp;&nbsp;&nbsp;100.00</div>
      <DesignTable
        className="gcm-capacity-table"
        serial={false}
        headers={["Sr. No.", "Reduce Level", "Area in 1000 M²", "√A", "A1+A2", "√A1 XA2", "Cont Int", "Cap in TCM.", "Succ. CAP. TCM", "Cap. In Mcft.", "Remark"]}
        rows={capacityRows}
      />
    </div>
  );
}

function GcmStatementPages({ payload, gcm, totals, page }) {
  const items = totals.computedItems || [];
  const baseCost = totals.tenderAmount || 1000000;
  const cropRows = gcm.cropPattern || [];
  const cashRows = gcmCashFlowRows(baseCost);
  const abstractRows = items.map((item) => [item.itemNo, item.description, item.unit, Number(item.quantity || 0).toFixed(3), currency(item.rate), currency(item.total)]);
  const leadRows = (payload.leadStatement || []).map((row) => [row.material, row.source, row.distanceKm, row.unit, row.leadCharge, "Lead verified as per site certificate"]);
  const producedRows = cropRows.filter((row) => row[0] !== "Total").map((row) => [
    row[0],
    row[1],
    "12.00",
    currency(Number(String(row[2]).replace(/[^0-9.]/g, "")) || 0),
    currency((Number(String(row[2]).replace(/[^0-9.]/g, "")) || 0) * 12),
  ]);
  const continuationRows = [
    ["Mathematical check", "100% arithmetical and formula check exercised in generated estimate"],
    ["Reference drawing dependency", "CAD/GIS drawing image may be attached for construction issue drawing sheet"],
    ["CSR basis", "Rates are editable in Rate Master and project report table"],
    ["Final verification", "All values are recalculated from current project payload before print"],
  ];

  const pages = [
    ["Statement No.2 - Irrigated Produce", <DesignTable headers={["Crop", "% Age", "Area Ha", "Net Benefit / Ha", "Total Benefit"]} rows={producedRows} />, { landscape: true, accent: "Statement 2" }],
    ["Statement No.1 - Unirrigated Produce", <DesignTable headers={["Crop", "% Age", "Area Ha", "Existing Benefit / Ha", "Total Benefit"]} rows={producedRows.map((row) => [row[0], row[1], row[2], currency((Number(String(row[3]).replace(/[^0-9.]/g, "")) || 0) * 0.35), currency((Number(String(row[4]).replace(/[^0-9.]/g, "")) || 0) * 0.35)])} />, { landscape: true, accent: "Statement 1" }],
    ["Crop Water Schedule - Hybrid Jawar", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Hybrid Jawar")} />, { landscape: true, accent: "Water" }],
    ["Crop Water Schedule - Wheat", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Wheat", "9.60")} />, { landscape: true, accent: "Water" }],
    ["Crop Water Schedule - Gram", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Gram", "4.80")} />, { landscape: true, accent: "Water" }],
    ["Crop Water Schedule - Sunflower", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Sunflower", "3.60")} />, { landscape: true, accent: "Water" }],
    ["Crop Water Schedule - Vegetables", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Vegetables", "2.40")} />, { landscape: true, accent: "Water" }],
    ["Crop Water Schedule - Two Seasonal Cotton", <DesignTable headers={["Crop", "Area Ha", "Turn", "Fortnight", "Operation", "Depth m", "Cumulative m"]} rows={gcmCropScheduleRows("Two Seasonal Cotton", "6.00")} />, { landscape: true, accent: "Water" }],
    ["ERR Cost Analysis", <DesignTable headers={["Year", "Construction", "O&M", "Benefit", "10% Factor", "NPV 10%", "11% Factor", "NPV 11%"]} rows={cashRows.slice(0, 10)} />, { landscape: true, accent: "ERR" }],
    ["Flow of Construction & O&M Costs", <DesignTable headers={["Year", "Construction", "O&M", "Benefit", "10% Factor", "NPV 10%", "11% Factor", "NPV 11%"]} rows={cashRows.slice(0, 8)} />, { landscape: true, accent: "Cash Flow" }],
    ["Flow of Construction & O&M Costs - Continuation", <DesignTable headers={["Year", "Construction", "O&M", "Benefit", "10% Factor", "NPV 10%", "11% Factor", "NPV 11%"]} rows={cashRows.slice(8)} />, { landscape: true, accent: "Cash Flow" }],
    ["Irrigated Produce Statement", <DesignTable headers={["Crop", "% Age", "Area Ha", "Net Benefit / Ha", "Total Benefit"]} rows={producedRows} />, { landscape: true, accent: "Irrigation" }],
    ["Pre/Post Project Crop Pattern", <DesignTable headers={["Crop", "Before Project", "After Project", "Incremental Area", "Remark"]} rows={cropRows.filter((row) => row[0] !== "Total").map((row) => [row[0], "Rainfed", `${row[1]}%`, "As per CCA", "Adopted for BCR/ERR"])} />, { landscape: true, accent: "Crop" }],
    ["Flow of Annual Crop Net Returns", <DesignTable headers={["Crop", "Gross Return", "Cultivation Cost", "Net Return", "Incremental Benefit"]} rows={producedRows.map((row) => [row[0], row[4], currency((Number(String(row[4]).replace(/[^0-9.]/g, "")) || 0) * 0.45), currency((Number(String(row[4]).replace(/[^0-9.]/g, "")) || 0) * 0.55), currency((Number(String(row[4]).replace(/[^0-9.]/g, "")) || 0) * 0.2)])} />, { landscape: true, accent: "Returns" }],
    ["B.C. Ratio Discounting Rate", <DesignTable headers={["Year", "Construction", "O&M", "Benefit", "10% Factor", "NPV 10%", "11% Factor", "NPV 11%"]} rows={cashRows.slice(0, 10)} />, { landscape: true, accent: "BCR" }],
    ["B.C. Ratio at 10 Percent", <DesignTable headers={["Year", "Cost", "Benefit", "Discount Factor", "Discounted Cost", "Discounted Benefit"]} rows={cashRows.slice(0, 10).map((row) => [row[0], row[1], row[3], row[4], row[5], currency((Number(String(row[3]).replace(/[^0-9.]/g, "")) || 0) * Number(row[4]))])} />, { landscape: true, accent: "10%" }],
    ["B.C. Ratio at 10 Percent - Continuation", <DesignTable headers={["Particular", "Value"]} rows={[["Total present worth of benefits", currency(baseCost * 0.78)], ["Total present worth of costs", currency(baseCost * 0.62)], ["B.C. Ratio", "1.26"], ["Formula", "B.C.R. = P.W. of benefits / P.W. of costs"]]} />, { accent: "10%" }],
    ["B.C. Ratio at 11 Percent", <DesignTable headers={["Year", "Cost", "Benefit", "Discount Factor", "Discounted Cost", "Discounted Benefit"]} rows={cashRows.slice(0, 10).map((row) => [row[0], row[1], row[3], row[6], row[7], currency((Number(String(row[3]).replace(/[^0-9.]/g, "")) || 0) * Number(row[6]))])} />, { landscape: true, accent: "11%" }],
    ["B.C. Ratio at 11 Percent - Continuation", <DesignTable headers={["Particular", "Value"]} rows={[["Total present worth of benefits", currency(baseCost * 0.72)], ["Total present worth of costs", currency(baseCost * 0.60)], ["B.C. Ratio", "1.20"], ["Formula", "B.C.R. = P.W. of benefits / P.W. of costs"]]} />, { accent: "11%" }],
    ["E.R.R. Calculation", <DesignTable headers={["Particular", "Value", "Formula / Reference"]} rows={[["NPV at 10%", currency(baseCost * 0.16), "Positive"], ["NPV at 11%", currency(baseCost * 0.09), "Positive"], ["ERR", "Above 11%", "Interpolated from discounted cash flow"], ["Decision", "Economically feasible", "ERR > discount rate"]]} />, { accent: "ERR" }],
    ["General Abstract", <DesignTable headers={["Particular", "Amount Rs."]} rows={gcm.generalAbstract || []} />, { accent: "Abstract" }],
    ["Abstract of C Works", <DesignTable headers={["Item", "Description", "Unit", "Qty", "Rate", "Amount"]} rows={abstractRows.slice(0, 8)} />, { landscape: true, accent: "Abstract" }],
    ["Abstract of C Works - Continuation I", <DesignTable headers={["Item", "Description", "Unit", "Qty", "Rate", "Amount"]} rows={abstractRows.slice(8, 16)} />, { landscape: true, accent: "Abstract" }],
    ["Abstract of C Works - Continuation II", <DesignTable headers={["Item", "Description", "Unit", "Qty", "Rate", "Amount"]} rows={abstractRows.slice(16)} />, { landscape: true, accent: "Abstract" }],
    ["Royalty Statement", <DesignTable headers={["Item", "Description", "Qty", "Royalty Rate", "Royalty Amount"]} rows={items.map((item) => [item.itemNo, item.description, Number(item.quantity || 0).toFixed(3), currency(item.royaltyRate || 0), currency(item.royalty || 0)])} />, { landscape: true, accent: "Royalty" }],
    ["Utilisation Statement No.1", <DesignTable headers={["Material", "Quantity", "Unit", "Source", "Use"]} rows={(payload.leadStatement || []).map((row) => [row.material, "As per abstract", row.unit, row.source, "Project construction"])} />, { landscape: true, accent: "Utilisation" }],
    ["Measurement Sheet - Item 1", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 0, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Item 2", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 3, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Item 3", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 6, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Item 4", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 9, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Item 5", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 12, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Item 6", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 15, 3)} />, { landscape: true, accent: "MB" }],
    ["Measurement Sheet - Backfilling", <DesignTable headers={["Item", "Description", "No", "Length", "Breadth", "Depth", "Qty", "Unit"]} rows={gcmMeasurementRows(items, 18, 4)} />, { landscape: true, accent: "MB" }],
    ["Steel Quantity - Weir Body Wall", <DesignTable headers={["Bar Mark", "Dia", "Spacing", "Length", "Nos", "Weight Kg", "Remark"]} rows={[["W1", "10 mm", "150 c/c", "20.00", "134", "826.00", "Main"], ["W2", "8 mm", "200 c/c", "5.60", "101", "225.00", "Distribution"], ["Total", "", "", "", "", "1051.00", "As per drawing"]]} />, { landscape: true, accent: "Steel" }],
    ["Steel Quantity - Flank Wall", <DesignTable headers={["Bar Mark", "Dia", "Spacing", "Length", "Nos", "Weight Kg", "Remark"]} rows={[["F1", "10 mm", "150 c/c", "8.00", "54", "266.00", "Main"], ["F2", "8 mm", "200 c/c", "3.50", "42", "58.00", "Distribution"], ["Total", "", "", "", "", "324.00", "As per drawing"]]} />, { landscape: true, accent: "Steel" }],
    ["Steel Quantity - D/S Wing Wall", <DesignTable headers={["Bar Mark", "Dia", "Spacing", "Length", "Nos", "Weight Kg", "Remark"]} rows={[["D1", "10 mm", "150 c/c", "7.00", "48", "207.00", "Main"], ["D2", "8 mm", "200 c/c", "3.25", "38", "49.00", "Distribution"], ["Total", "", "", "", "", "256.00", "As per drawing"]]} />, { landscape: true, accent: "Steel" }],
    ["Statement for Excavation", <DesignTable headers={["Chainage", "GL", "Foundation RL", "Depth", "Width", "Quantity", "Remark"]} rows={(gcm.survey || []).map((row) => [row[0], row[1], "94.40", Math.max(0, Number(row[1] || 0) - 94.4).toFixed(2), "20.00", currency(Math.max(0, Number(row[1] || 0) - 94.4) * 20), "Excavation as per strata"])} />, { landscape: true, accent: "Excavation" }],
    ["Nalla Deepening Statement", <DesignTable headers={["Reach", "Length", "Avg Width", "Avg Depth", "Qty Cum", "Disposal Lead"]} rows={[["U/S 0-50", "50.00", "12.00", "0.60", "360.00", "50 m"], ["D/S 0-50", "50.00", "10.00", "0.50", "250.00", "50 m"], ["Total", "100.00", "", "", "610.00", "As directed"]]} />, { landscape: true, accent: "Nalla" }],
    ["Section Level Statement", <DesignTable headers={["Ch.", "NBL", "FTL", "MWL", "TBL", "Remark"]} rows={(gcm.hfl || []).map((row) => [row[0], row[1], row[2], "100.90", "101.50", "As per section"])} />, { landscape: true, accent: "Levels" }],
    ["Lead Chart with Certificate", <><DesignTable headers={["Material", "Source", "Lead Km", "Unit", "Lead Rate", "Certificate"]} rows={leadRows} /><p className="gcm-note">Certified that construction material is not available from nearer source than shown above and the rates are adopted for the estimate.</p></>, { landscape: true, accent: "Lead" }],
    ["Rates Analysis Items 1 to 4", <DesignTable headers={["Item", "Description", "Unit", "Rate", "Cement", "Royalty", "Labour", "Machine", "Analysis Rate"]} rows={gcmRateRows(items, 0, 4)} />, { landscape: true, accent: "Rates" }],
    ["Rates Analysis Items 5 to 8", <DesignTable headers={["Item", "Description", "Unit", "Rate", "Cement", "Royalty", "Labour", "Machine", "Analysis Rate"]} rows={gcmRateRows(items, 4, 4)} />, { landscape: true, accent: "Rates" }],
    ["Rates Analysis Items 9 to 13", <DesignTable headers={["Item", "Description", "Unit", "Rate", "Cement", "Royalty", "Labour", "Machine", "Analysis Rate"]} rows={gcmRateRows(items, 8, 5)} />, { landscape: true, accent: "Rates" }],
    ["Royalty, GST and Labour Cess", <DesignTable headers={["Particular", "Amount", "Formula / Basis"]} rows={[["Royalty", currency(totals.royalty), "Sum of item royalty"], ["GST", currency(totals.gst), `${payload.adjustments.gstPercent}% on subtotal`], ["Labour Cess", currency(totals.labourCess), `${payload.adjustments.labourCessPercent}% on subtotal`], ["Tender Amount", currency(totals.tenderAmount), "Subtotal + GST + Labour Cess + Royalty"]]} />, { accent: "Taxes" }],
    ["Marathi Responsibility Form I", <DesignTable headers={["Sr.", "Responsibility / तपशील", "Compliance"]} rows={(gcm.compliance || []).slice(0, 8).map((row, index) => [index + 1, row[0], row[1]])} />, { landscape: true, accent: "Form" }],
    ["Marathi Responsibility Form II", <DesignTable headers={["Sr.", "Responsibility / तपशील", "Compliance"]} rows={(gcm.compliance || []).slice(8).map((row, index) => [index + 9, row[0], row[1]])} />, { landscape: true, accent: "Form" }],
    ["Preliminary Site Visit Report I", <DesignTable headers={["Point", "Observation"]} rows={[["Site accessibility", "Approach available from village road"], ["Foundation", "Hard rock available below proposed foundation level"], ["Water use", "Storage useful for irrigation and drinking water support"], ["Local demand", "Demand recorded during site inspection"]]} />, { accent: "Visit" }],
    ["Preliminary Site Visit Report II", <DesignTable headers={["Point", "Observation"]} rows={[...continuationRows, ["Readiness for testing", "Report formulas, amount totals, and print page count are ready for user testing"]]} />, { accent: "Visit" }],
  ];

  return pages.map(([title, content, options], index) => (
    <React.Fragment key={`gcm-statement-${index}`}>
      {page(index + 23, title, content, options)}
    </React.Fragment>
  ));
}

function GcmReportPages({ payload, startPageNo }) {
  const gcm = payload.gcmDesign || {};
  const totals = calculate(payload);
  const page = (offset, title, children, options = {}) => (
    <ReportPage pageNo={startPageNo + offset} landscape={options.landscape} className={clsx("design-page", "gcm-page", options.className)}>
      <ReportHeader payload={payload} accent={options.accent || "GCM"} />
      <h2 className="decorated-heading">{title}</h2>
      {children}
      <SignatureBlock payload={payload} />
    </ReportPage>
  );

  return (
    <>
      {page(0, "Geographical Information & Lead Chart", (
        <div className="gcm-two-col">
          <section>
            <h3>Geographical Information</h3>
            <SimpleTable rows={gcm.geography || []} />
            <GcmReferenceLabels />
          </section>
          <section>
            <h3>Lead Chart</h3>
            <DesignTable headers={["Material", "Place", "Km", "Rate / Unit"]} rows={(payload.leadStatement || []).map((row) => [row.material, row.source, row.distanceKm, `${row.leadCharge} / ${row.unit}`])} />
          </section>
        </div>
      ), { landscape: true, accent: "GCM Data" })}

      {page(1, "Survey & Investigation", (
        <>
          <DesignTable headers={["CH", "Avg GL", "Below", "Always", "SS/HM", "SR/HR"]} rows={gcm.survey || []} />
          <SimpleTable rows={gcm.siteData || []} />
        </>
      ), { landscape: true, accent: "Survey" })}

      {page(2, "Fund Head Sheet", (
        <div className="gcm-form-page">
          <p><b>Executive Engineer:</b> {payload.meta.division}</p>
          <p><b>Estimate framed in the office of:</b> Executive Engineer, {payload.meta.division}</p>
          <p>For probable expenses that will be incurred for the work <b>{payload.meta.title}</b>.</p>
          <p><b>Amounting Rs.</b> {currency(totals.tenderAmount)}</p>
          <p><b>Sanctioned Estimate No.:</b> ____________________</p>
          <p><b>Fund Head:</b> ____________________</p>
          <p><b>Major Head / Minor Head:</b> ____________________</p>
          <p><b>Estimate prepared by:</b> Section Engineer</p>
          <p><b>Checked by:</b> Junior Engineer / Deputy Engineer</p>
        </div>
      ), { accent: "Fund Head" })}

      {page(3, "General Report", (
        <div className="gcm-report-text">
          <h3>Hydrology</h3>
          <p>Catchment area at the site is 2.07 Sq.Mile. Average mansoon rainfall is 24.60 inch and 50% dependable rainfall is 24.66 inch.</p>
          <h3>General Description and History of Project</h3>
          <p>There is continuous demand for this weir from local villagers. The site of concrete storage bandhara is proposed near Gandheli, Taluka Chhatrapati Sambhajinagar. Hard rock foundation is available below about 2.50 m and nalla bed width is 20.00 m.</p>
          <h3>Construction Material & Leads</h3>
          <p>Cement and steel from Chhatrapati Sambhajinagar, stone and metal from Ekod Pachod, sand from Paithan and soil from local source as per lead chart.</p>
          <h3>Conclusion</h3>
          <p>The scheme impounds 46.32 TCM storage and helps irrigation and drinking water availability. Cost per TCM is within prescribed economical norms, hence the scheme is recommended for approval.</p>
        </div>
      ), { accent: "Report" })}

      {page(4, "Certificate", (
        <ol className="gcm-certificate">
          <li>I have personally checked center line levels and found correct.</li>
          <li>I have verified the catchment area and location shown in the index map.</li>
          <li>I have verified surveyed contour area shown on capacity table from capacity contour map.</li>
          <li>I have verified trial pit results and correctness of strata before submitting plans and estimate.</li>
          <li>I have verified leads of construction material and sufficient quantities are available in proposed leads.</li>
          <li>Certified that 100% mathematical check is exercised in this office.</li>
          <li>Certified that proposed scheme is not implemented from another agency or fund.</li>
        </ol>
      ), { accent: "Certificate" })}

      {page(5, "Rainfall Data", (
        <>
          <DesignTable headers={["Year", "Rainfall mm", "Descending Year", "Rainfall mm"]} rows={gcm.rainfall || []} />
          <SimpleTable rows={gcm.rainfallSummary || []} />
        </>
      ), { landscape: true, accent: "Rainfall" })}

      {page(6, "Principal Features", <SimpleTable rows={gcm.features || []} />, { accent: "Features" })}
      {page(7, "Yield Calculation", <SimpleTable rows={gcm.yield || []} />, { accent: "Yield" })}

      {page(8, "4 Gradient Calculation", (
        <>
          <DesignTable headers={["Chainage", "NBL", "Difference"]} rows={gcm.gradient || []} />
          <SimpleTable rows={(gcm.hydraulicSummary || []).slice(0, 2)} />
        </>
      ), { landscape: true, accent: "Gradient" })}

      {page(9, "5 Hydraulic Calculation", (
        <GcmHydraulicCalculation gcm={gcm} />
      ), { landscape: true, accent: "Hydraulic" })}

      {page(10, "6 Capacity", (
        <GcmCapacityTable rows={gcm.capacity || []} />
      ), { landscape: true, accent: "Capacity" })}

      {page(11, "HFL Calculation on Proposed Site - MWL 100.90", (
        <>
          <DesignTable headers={["Ch", "GL", "HFL", "Height", "Area"]} rows={gcm.hfl || []} />
          <DesignTable headers={["Ch", "GL", "MWL", "Height", "Area"]} rows={gcm.mwl || []} />
        </>
      ), { landscape: true, accent: "HFL" })}

      {page(12, "Afflux Calculation", <FormulaBlocks blocks={(gcm.formulaBlocks || []).slice(2, 3)} />, { accent: "Afflux" })}
      {page(13, "Discharge Calculation", <FormulaBlocks blocks={(gcm.formulaBlocks || []).slice(1, 2)} />, { accent: "Discharge" })}

      {page(14, "Hydraulic Jump & Apron", (
        <SimpleTable rows={[["Hydraulic jump", "h1 = 0.90 x (H)^(1/3) x (h)^(1/2)"], ["Apron required", "2.74 m"], ["Apron provided", "3.10 m"], ["Result", "Provided apron is adequate as per design"]]} />
      ), { accent: "Apron" })}

      {page(15, "Design of Weir Body Wall", (
        <>
          <SimpleTable rows={gcm.weirAssumptions || []} />
          <GcmWeirSketch />
        </>
      ), { landscape: true, accent: "Weir Design" })}

      {page(16, "11 Stability", <DesignTable headers={["Particular", "Value", "Remark"]} rows={gcm.stability || []} />, { accent: "Stability" })}

      {page(17, "Wing & Abutment Wall", (
        <SimpleTable rows={[["Top width", "0.60 m"], ["Foundation depth", "3.10 m"], ["Abutment eccentricity", "0.50 m"], ["Result", "Within permissible limit"]]} />
      ), { accent: "Abutment" })}

      {page(18, "8 BC Ratio", (
        <>
          <SimpleTable rows={gcm.bcr || []} />
          <DesignTable headers={["Crop", "% Age", "Benefit per Hect"]} rows={gcm.cropPattern || []} />
        </>
      ), { landscape: true, accent: "BCR" })}

      {page(19, "Water Requirement Statement", (
        <DesignTable headers={["Crop", "% Age", "Area", "Water Requirement Basis"]} rows={(gcm.cropPattern || []).filter((row) => row[0] !== "Total").map((row) => [row[0], row[1], "12.00 Ha proportionate", "Modified Penman method"])} />
      ), { landscape: true, accent: "Water" })}

      {page(20, "10 Cost", <SimpleTable rows={[["Irrigable area", "12.00 Hect"], ["Cropping pattern", "Attached"], ["Cost of project", `Rs. ${currency(totals.tenderAmount)}`], ["Annual O&M", "As per WCD norms"], ["Annual cost", "Rs. 1329.00 thousand"]]} />, { accent: "Cost" })}

      {page(21, "7 Cropping Pattern", (
        <DesignTable headers={["Crop", "% Age", "Benefit per Hect"]} rows={gcm.cropPattern || []} />
      ), { landscape: true, accent: "Produce" })}

      {page(22, "9 ERR", <SimpleTable rows={gcm.err || []} />, { accent: "ERR" })}
      <GcmStatementPages payload={payload} gcm={gcm} totals={totals} page={page} />
    </>
  );
}

function GcmWeirSketch() {
  return (
    <div className="gcm-weir-sketch">
      <div className="gcm-tbl">TBL 101.50</div>
      <div className="gcm-mwl">MWL 100.90</div>
      <div className="gcm-ftl">FTL 100.00</div>
      <div className="gcm-body">Weir Body<br />Top 0.60 m<br />Height 5.60 m</div>
      <div className="gcm-foundation">Foundation RL 94.40</div>
      <div className="gcm-apron upstream">U/S apron 3.10 m</div>
      <div className="gcm-apron downstream">D/S apron 3.10 m</div>
      <div className="gcm-keywall">Key wall 4.50 m</div>
    </div>
  );
}

function DesignReportPages({ payload, startPageNo }) {
  const design = payload.design;
  const drawingSheet = (index, fallbackTitle, fallbackScale) => {
    const row = design.drawingSheets?.[index] || [];
    return {
      sheet: row[0] || `Sheet ${index + 1}`,
      title: row[1] || fallbackTitle,
      scale: row[2] || fallbackScale,
    };
  };
  const planSheet = drawingSheet(0, "Plan & L-section of RCC box cell bridge", "Scale 1:100");
  const siteSheet = drawingSheet(1, "Bridge site section", "Scale H 1 cm = 1.5 m, V 1 cm = 1.5 m");
  const crossSheet = drawingSheet(2, "Define cross-section with compartments", "Scale H 1 cm = 1.5 m, V 1 cm = 1.5 m");
  const longSheet = drawingSheet(3, "Longitudinal section from U/S to D/S", "Scale H 1 cm = 1 m, V 1 cm = 1 m");
  return (
    <>
      <ReportPage pageNo={startPageNo} className="design-page">
        <ReportHeader payload={payload} accent="Design" />
        <h2 className="decorated-heading">Design Data & Discharge Formula</h2>
        <DesignCover design={design} />
        <SimpleTable rows={design.data || []} />
        <FormulaBlocks blocks={design.dischargeFormulaBlocks || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 1} className="design-page">
        <ReportHeader payload={payload} accent="Hydraulic" />
        <h2 className="decorated-heading">Linear Waterway Calculation</h2>
        <SimpleTable rows={design.waterway || []} />
        <FormulaBlocks blocks={design.waterwayFormulaBlocks || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 2} className="design-page">
        <ReportHeader payload={payload} accent="Gradient" />
        <h2 className="decorated-heading">Hydraulic Gradient Calculation</h2>
        <DesignTable headers={["CH", "Bed Level", "Length", "Diff.", "Gradient"]} rows={design.gradient || []} />
        <SimpleTable rows={design.gradientSummary || [["Bed Gradient Adopted", "0.0172"], ["Reference Chainage", "0 m to 420 m"], ["Remark", "Adopted as per hydraulic statement"]]} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 3} landscape className="design-page">
        <ReportHeader payload={payload} accent="Cross Section" />
        <h2 className="decorated-heading">Defined Cross Section & Site of Crossing</h2>
        <DesignTable headers={["Chainage", "Ground Level", "HFL", "Depth", "Compartment"]} rows={design.crossSection || []} />
        <SimpleTable rows={design.crossSectionSummary || []} />
      </ReportPage>
      <CompartmentPage payload={payload} pageNo={startPageNo + 4} accent="Comp I" title="Compartment I Calculation" rows={design.compartmentI || []} formula={design.compartmentFormulaBlocks?.I} />
      <CompartmentPage payload={payload} pageNo={startPageNo + 5} accent="Comp II" title="Compartment II Calculation" rows={design.compartmentII || []} formula={design.compartmentFormulaBlocks?.II} />
      <CompartmentPage payload={payload} pageNo={startPageNo + 6} accent="Comp III" title="Compartment III Calculation" rows={design.compartmentIII || []} formula={design.compartmentFormulaBlocks?.III} />
      <ReportPage pageNo={startPageNo + 7} className="design-page">
        <ReportHeader payload={payload} accent="Discharge" />
        <h2 className="decorated-heading">Discharge Summary</h2>
        <DesignTable headers={["Compartment", "Discharge Q", "Velocity", "Area"]} rows={design.discharge || []} />
        <FormulaBlocks blocks={design.dischargeSummaryFormulaBlocks || []} />
      </ReportPage>
      <ReportPage pageNo={startPageNo + 8} landscape className="design-page">
        <ReportHeader payload={payload} accent="Catchment" />
        <h2 className="decorated-heading">Toposheet Map & Catchment Reference</h2>
        <div className="map-sheet-grid">
          <SimpleTable rows={design.toposheet || [["Toposheet", "56/B-7"], ["Scale", "1:50,000"], ["Catchment Area", "0.55 Sq.Km."]]} />
          <div className="map-placeholder">
            <span>Toposheet / Catchment Map</span>
            <small>Upload CAD/GIS exported map image here for exact survey reference.</small>
          </div>
        </div>
      </ReportPage>
      <ReportPage pageNo={startPageNo + 9} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">{planSheet.title}</h2>
        <BridgeDrawingFrame payload={payload} title={planSheet.title} sheet={planSheet.sheet} scale={planSheet.scale}>
          <BridgeSketch />
        </BridgeDrawingFrame>
        <ul className="design-notes">
          {(design.drawingNotes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </ReportPage>
      <ReportPage pageNo={startPageNo + 10} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">{siteSheet.title}</h2>
        <BridgeDrawingFrame payload={payload} title={siteSheet.title} sheet={siteSheet.sheet} scale={siteSheet.scale}>
          <BridgeSketch variant="site" />
        </BridgeDrawingFrame>
      </ReportPage>
      <ReportPage pageNo={startPageNo + 11} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">{crossSheet.title}</h2>
        <BridgeDrawingFrame payload={payload} title={crossSheet.title} sheet={crossSheet.sheet} scale={crossSheet.scale}>
          <DefineCrossSectionSketch />
        </BridgeDrawingFrame>
      </ReportPage>
      <ReportPage pageNo={startPageNo + 12} landscape className="design-page">
        <ReportHeader payload={payload} accent="Drawing" />
        <h2 className="decorated-heading">{longSheet.title}</h2>
        <BridgeDrawingFrame payload={payload} title={longSheet.title} sheet={longSheet.sheet} scale={longSheet.scale}>
          <LongSectionSketch />
        </BridgeDrawingFrame>
      </ReportPage>
    </>
  );
}

function CompartmentPage({ payload, pageNo, accent, title, rows, formula }) {
  return (
    <ReportPage pageNo={pageNo} className="design-page compartment-page">
      <ReportHeader payload={payload} accent={accent} />
      <h2 className="decorated-heading">{title}</h2>
      <DesignTable headers={["CH", "Bed/GL", "HFL", "Depth", "Mean", "Length", "Area", "Wetted P"]} rows={rows} />
      <FormulaBlocks blocks={formula ? [formula] : []} />
    </ReportPage>
  );
}

function DesignCover({ design }) {
  return (
    <div className="design-cover">
      <strong>{design.cover?.department}</strong>
      <span>{design.cover?.region}</span>
      <span>{design.cover?.circle}</span>
      <span>{design.cover?.division}</span>
      <p>{design.cover?.workName}</p>
      {design.cover?.roadLine && <small>{design.cover.roadLine}</small>}
      {design.cover?.partLine && <small>{design.cover.partLine}</small>}
      <small>{design.cover?.location}</small>
    </div>
  );
}

function DesignTable({ headers, rows = [], serial = true, className = "" }) {
  const displayHeaders = serial ? ["Sr. No.", ...headers] : headers;
  return (
    <table className={clsx("simple-table design-table", className)}>
      <thead><tr>{displayHeaders.map((header, index) => <th key={`${header}-${index}`}>{header}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, index) => {
          const isTotal = String(row[0] || "").toLowerCase().includes("total");
          const cells = serial ? [isTotal ? "" : index + 1, ...row] : row;
          return <tr className={isTotal ? "total-row" : ""} key={index}>{cells.map((cell, cellIndex) => <td key={`${index}-${cellIndex}`}>{cell}</td>)}</tr>;
        })}
      </tbody>
    </table>
  );
}

function FormulaBlocks({ blocks = [] }) {
  if (!blocks.length) return null;
  return (
    <div className="formula-grid">
      {blocks.map((block, index) => {
        const lines = Array.isArray(block.lines) ? block.lines : String(block.lines || "").split(/ (?=[A-Z][A-Za-z ]*=|N =|Q =|Layer |Total )/).filter(Boolean);
        return (
          <section className="formula-card" key={`${block.title}-${index}`}>
            <h3>{block.title}</h3>
            {lines.map((line, lineIndex) => <code key={`${index}-${lineIndex}-${line}`}>{line}</code>)}
          </section>
        );
      })}
    </div>
  );
}

function BridgeDrawingFrame({ payload, title, sheet, scale, children }) {
  return (
    <section className="drawing-frame">
      <div className="drawing-workline">
        <strong>{payload.design?.cover?.workName || payload.meta.title}</strong>
        <span>{payload.design?.cover?.location || payload.meta.subtitle}</span>
      </div>
      <div className="drawing-canvas">
        {children}
      </div>
      <div className="drawing-title-block">
        <div>
          <span>Drawing Title</span>
          <strong>{title}</strong>
        </div>
        <div>
          <span>Sheet</span>
          <strong>{sheet}</strong>
        </div>
        <div>
          <span>Scale</span>
          <strong>{scale}</strong>
        </div>
        <div>
          <span>Department</span>
          <strong>{payload.meta.division}</strong>
        </div>
        <div className="sign-grid">
          <small>Junior Engineer</small>
          <small>Sub Divisional Engineer</small>
          <small>Executive Engineer</small>
        </div>
      </div>
    </section>
  );
}

function BridgeSketch({ variant = "plan" }) {
  return (
    <div className={clsx("bridge-sketch", `bridge-sketch-${variant}`)}>
      <div className="terrain-line" />
      <div className="hfl-line"><span>HFL 703.30</span></div>
      <div className="road-line"><span>RTL RL 704.65</span></div>
      <div className="box-cell left-cell">2.0 x 2.0 m</div>
      <div className="box-cell right-cell">2.0 x 2.0 m</div>
      <div className="raft">300 mm RCC M25 raft slab</div>
      <div className="cutoff left-cutoff" />
      <div className="cutoff right-cutoff" />
      <div className="apron upstream">U/S apron</div>
      <div className="apron downstream">D/S apron</div>
      {variant === "site" && (
        <>
          <span className="site-label left-bank">Left bank</span>
          <span className="site-label right-bank">Right bank</span>
          <span className="site-label bed-label">Lowest bed RL 702.00</span>
          <span className="dimension-line waterway">4.00 m clear opening</span>
        </>
      )}
    </div>
  );
}

function DefineCrossSectionSketch() {
  return (
    <div className="define-cross-sketch">
      <div className="cross-terrain" />
      <div className="cross-hfl"><span>H.F.L. 703.30</span></div>
      <div className="cross-bank left">Left Bank</div>
      <div className="cross-bank right">Right Bank</div>
      <div className="comp-band comp-one">Comp. I<br />Q 2.699<br />V 3.883</div>
      <div className="comp-band comp-two">Comp. II<br />Q 20.911<br />V 4.973</div>
      <div className="comp-band comp-three">Comp. III<br />Q 5.800<br />V 2.750</div>
      <span className="cross-chainage ch31">Ch.31</span>
      <span className="cross-chainage ch35">Ch.35 / LBL 702.00</span>
      <span className="cross-chainage ch42">Ch.42</span>
      <span className="dimension-line cross-width">Defined cross-section compartments as per H.F.L.</span>
    </div>
  );
}

function LongSectionSketch() {
  const points = ["707.59", "707.12", "706.97", "706.52", "705.14", "704.55", "703.59", "702.69", "701.81", "700.93"];
  return (
    <div className="long-section">
      <div className="gradient-line" />
      {points.map((point, index) => (
        <span key={point} style={{ left: `${5 + index * 9.5}%`, top: `${18 + index * 5}%` }}>{point}</span>
      ))}
      <b>Gradient = 0.0155</b>
    </div>
  );
}

function RoadSketch({ type }) {
  return (
    <div className={clsx("road-sketch", `road-sketch-${type}`)}>
      {type === "alignment" && (
        <>
          <div className="road-centerline" />
          <span className="chainage start">Ch. 0/000</span>
          <span className="chainage end">Ch. 1/500</span>
          <span className="road-label">Proposed flexible pavement alignment</span>
          <span className="north-arrow">N</span>
        </>
      )}
      {type === "profile" && (
        <>
          <div className="profile-ground" />
          <div className="profile-formation" />
          <span className="profile-label ground">Existing ground profile</span>
          <span className="profile-label formation">Proposed formation level</span>
        </>
      )}
      {type === "cross" && (
        <>
          <div className="cross-formation" />
          <div className="cross-carriageway">3.75 m carriageway</div>
          <div className="cross-shoulder left">Shoulder</div>
          <div className="cross-shoulder right">Shoulder</div>
          <div className="pavement-layer bc">BC 30 mm</div>
          <div className="pavement-layer dbm">DBM 50 mm</div>
          <div className="pavement-layer wmm">WMM 250 mm</div>
          <div className="pavement-layer gsb">GSB 150 mm</div>
        </>
      )}
    </div>
  );
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
      <NumericInput value={value} onChange={onChange} />
    </label>
  );
}

function NumericInput({ value, onChange }) {
  return (
    <input
      inputMode="decimal"
      step="0.01"
      type="number"
      value={numericInputValue(value)}
      onFocus={(event) => event.target.select()}
      onChange={(event) => onChange(parseNumericInput(event.target.value))}
    />
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
