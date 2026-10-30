export const services = [
  [
    'Web & Applications',
    'Website design, custom PC and mobile applications, SaaS, internal tools, and dashboards.',
  ],
  [
    'Backend & Infrastructure',
    'Server support, APIs, cloud infrastructure, integrations, and system modernization.',
  ],
  [
    'Automation & Intelligence',
    'Workflow automation, AI-enabled features, analytics, and operational software.',
  ],
  [
    'Specialized Engineering',
    'XR/VR, real-time 3D, simulation, visualization, and research prototypes.',
  ],
] as const;
export const serviceDetails = [
  {
    title: 'Web & Applications',
    description:
      'Build a useful interface around the work your customers and team need to do.',
    capabilities: [
      'Website design and accessible web applications',
      'Business-based custom applications for PC and mobile devices',
      'SaaS applications, internal tools, and customer portals',
    ],
    approach:
      'Start with essential workflows, make them clear and accessible, and build a maintainable foundation for the next iteration.',
  },
  {
    title: 'Backend & Infrastructure',
    description:
      'Connect the systems behind your product with dependable software and clear interfaces.',
    capabilities: [
      'API design and third-party integrations',
      'Server support, cloud services, deployment workflows, and observability',
      'Data workflows and modernization of existing systems',
    ],
    approach:
      'Choose infrastructure to fit the workload. Document decisions, automate repeatable operations, and keep complexity in proportion.',
  },
  {
    title: 'Automation & Intelligence',
    description:
      'Reduce repetitive work and introduce AI-enabled features where they solve a concrete problem.',
    capabilities: [
      'Workflow and business-process automation',
      'AI service integrations with appropriate human review',
      'Reporting, analytics, and connections between business tools',
    ],
    approach:
      'Define the intended result and failure cases first. Validate against real workflows and keep people in control of consequential decisions.',
  },
  {
    title: 'Specialized Engineering',
    description:
      'Explore complex ideas through interactive systems, simulation, and focused technical prototypes.',
    capabilities: [
      'XR and immersive application development',
      'Real-time 3D, simulation, and visualization',
      'Research software and feasibility prototypes',
    ],
    approach:
      'Make technical uncertainty explicit, prototype difficult parts early, and distinguish experimental findings from production claims.',
  },
] as const;
