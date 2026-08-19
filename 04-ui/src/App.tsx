import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Shell from "./components/Shell";

const Overview = lazy(() => import("./pages/Overview"));
const Alerts = lazy(() => import("./pages/Alerts"));
const Attack = lazy(() => import("./pages/Attack"));
const Llm = lazy(() => import("./pages/Llm"));
const Logs = lazy(() => import("./pages/Logs"));
const Cases = lazy(() => import("./pages/Cases"));
const Intel = lazy(() => import("./pages/Intel"));
const Workflows = lazy(() => import("./pages/Workflows"));
const Actions = lazy(() => import("./pages/Actions"));
const Settings = lazy(() => import("./pages/Settings"));
const Detector = lazy(() => import("./pages/Detector"));
const Analyzer = lazy(() => import("./pages/Analyzer"));

function Fallback() {
  return <div className="p-6 text-sm text-text-secondary">로딩 중…</div>;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route
          path="/"
          element={
            <Suspense fallback={<Fallback />}>
              <Overview />
            </Suspense>
          }
        />
        <Route
          path="/alerts"
          element={
            <Suspense fallback={<Fallback />}>
              <Alerts />
            </Suspense>
          }
        />
        <Route
          path="/attack"
          element={
            <Suspense fallback={<Fallback />}>
              <Attack />
            </Suspense>
          }
        />
        <Route
          path="/llm"
          element={
            <Suspense fallback={<Fallback />}>
              <Llm />
            </Suspense>
          }
        />
        <Route
          path="/logs"
          element={
            <Suspense fallback={<Fallback />}>
              <Logs />
            </Suspense>
          }
        />
        <Route
          path="/cases"
          element={
            <Suspense fallback={<Fallback />}>
              <Cases />
            </Suspense>
          }
        />
        <Route
          path="/intel"
          element={
            <Suspense fallback={<Fallback />}>
              <Intel />
            </Suspense>
          }
        />
        <Route
          path="/workflows"
          element={
            <Suspense fallback={<Fallback />}>
              <Workflows />
            </Suspense>
          }
        />
        <Route
          path="/actions"
          element={
            <Suspense fallback={<Fallback />}>
              <Actions />
            </Suspense>
          }
        />
        <Route
          path="/detector"
          element={
            <Suspense fallback={<Fallback />}>
              <Detector />
            </Suspense>
          }
        />
        <Route
          path="/analyzer"
          element={
            <Suspense fallback={<Fallback />}>
              <Analyzer />
            </Suspense>
          }
        />
        <Route
          path="/settings"
          element={
            <Suspense fallback={<Fallback />}>
              <Settings />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
