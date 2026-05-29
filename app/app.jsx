// App router with view transitions
const { useState: useS, useEffect: useE } = React;

function App() {
  const [view, setView] = useS(() => localStorage.getItem("provana_view") || "portal");
  const [anim, setAnim] = useS(""); // "" = resting (always visible), "out" = fading

  const go = (next) => {
    if (next === view) return;
    setAnim("out");
    setTimeout(() => {
      setView(next);
      localStorage.setItem("provana_view", next);
      const sc = document.querySelector(".scroll");
      if (sc) sc.scrollTop = 0;
      setAnim(""); // transitions back to visible
    }, 170);
  };

  const View = view === "requests"    ? ViewRequests
    : view === "form"        ? ViewForm
    : view === "newpage"     ? ViewFormNewPage
    : view === "newfeature"  ? ViewFormNewFeature
    : view === "fixissue"    ? ViewFormFixIssue
    : view === "viewrequest" ? ViewFormViewRequest
    : view === "profile"     ? ViewProfile
    : view === "myrequests"  ? ViewRequestsList
    : ViewPortal;
  return (
    <div className="scroll">
      <div className={"view-anim " + anim}>
        <View go={go} />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
