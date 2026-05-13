import { Canvas } from "./Canvas";
import { PromptComposer } from "./PromptComposer";

export function ClassicWorkspace() {
  return (
    <div className="classic-workspace">
      <div className="classic-workspace__stage">
        <Canvas />
      </div>
      <div className="classic-workspace__dock">
        <PromptComposer variant="bottom" />
      </div>
    </div>
  );
}
