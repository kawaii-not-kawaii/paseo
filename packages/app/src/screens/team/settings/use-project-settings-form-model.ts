import { useEffect, useState } from "react";
import {
  openProjectSettingsForm,
  type ProjectSettingsFormSnapshot,
} from "./project-settings-form-model";

export function useProjectSettingsFormModel(snapshot: ProjectSettingsFormSnapshot) {
  const [model] = useState(() => openProjectSettingsForm(snapshot));

  useEffect(() => {
    return () => {
      model.close();
    };
  }, [model]);

  return model;
}
