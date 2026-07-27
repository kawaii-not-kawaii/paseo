import { useEffect, useState } from "react";
import { openMemberForm, type MemberFormSnapshot } from "./member-form-model";

export function useMemberFormModel(snapshot: MemberFormSnapshot) {
  const [model] = useState(() => openMemberForm(snapshot));

  useEffect(() => {
    return () => {
      model.close();
    };
  }, [model]);

  useEffect(() => {
    model.applyProjects(snapshot.projects);
    model.applyAssignments(snapshot.assignments);
    model.applyTemplates(snapshot.templates);
    model.applyProviderEntries(snapshot.providerEntries);
  }, [
    model,
    snapshot.assignments,
    snapshot.projects,
    snapshot.providerEntries,
    snapshot.templates,
  ]);

  return model;
}
