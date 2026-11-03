import { Check } from 'lucide-react';

/** Step dots for the voting wizards (classic and points). */
export default function WizardProgressBar({
  steps,
  currentStep,
}: {
  steps: string[];
  currentStep: number;
}) {
  return (
    <div className="contest__wizard-progress">
      {steps.map((label, i) => (
        <div
          key={label}
          className={`contest__wizard-step${i === currentStep ? ' contest__wizard-step--active' : ''}${i < currentStep ? ' contest__wizard-step--completed' : ''}`}
        >
          <div className="contest__wizard-step-dot">
            {i < currentStep ? <Check size={12} /> : i + 1}
          </div>
          <span className="contest__wizard-step-label">{label}</span>
        </div>
      ))}
    </div>
  );
}
