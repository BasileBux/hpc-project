#import "report.typ": *

#show: report.with(
  title: "Exploration de l'optimisation de code avec des outils LLM",
  course: "HPC",
  subject: "", // will be removed if given an empty string
  teacher: ("Alberto Dassatti", "Bruno Da Rocha Carvalho"),
  students: ("Kilian Froidevaux", "Basile Buxtorf"),
  university: "HEIG-VD",
  logo: "logos/title-logo.png",
  logo-offset: 1cm,
  date: datetime.today(),
  // date: datetime(day: 15, month: 10, year: 2025),
)

= Introduction

Nous avons choisi le second challenge qui est un projet exploratoire sur l’optimisation
de code avec des outils LLM.

Nous avons choisi d'implémenter un plugin d'optimisation de code pour #link("https://pi.dev")[Pi.dev],
un harness d'agent IA très extensible. Ce plugin utiliserait des sous-agents spécialisés
pour analyser le code, identifier les opportunités d'optimisation, proposer des améliorations
et benchmarker les résultats. L'objectif est d'obtenir des gains de performance significatifs
avec des modèles moins performants que les plus grands LLM en utilisant moins de tokens.
Cela grâce à une approche plus ciblée où chaque sous-agent se concentre sur une tâche
spécifique, et n'a accès qu'aux informations nécessaires à sa tâche, ce qui permet
de réduire le nombre de tokens utilisés et d'améliorer l'efficacité globale du processus.

La philosophie de #link("https://pi.dev")[Pi.dev] est de fournir une plateforme flexible
et modulaire qui rend possible n'importe quelle application d'agent IA. La documentation
est intégrée dans l'environnement et les agents y ont accès, ce qui permet d'écrire
des extensions de manière autonome. L'agent de base reste volontairement minimaliste :
plutôt que d'intégrer un grand nombre de fonctionnalités dès le départ, la plateforme
lui fournit les outils, les connaissances et l'infrastructure nécessaires pour que
des LLM puissent générer et faire évoluer leurs propres modules selon les besoins.

Nous avons choisi cette approche pour écrire le module d'optimisation de code. Cependant,
les spécifications ont été écrite manuellement ce qui nous a permis de nous concentrer
sur la partie de conception de la pipeline d'optimisation et de l'orchestration
plutôt que sur l'implémentation. Les prompts utilisés sont en annexe du rapport.

#todo("Add annex with the actual prompts used")

= Installation

Pour installer #link("https://pi.dev")[Pi.dev], il y a plusieurs possiblités, toutes
décrites sur leur site web. IL faut ensuite une clé d'API pour pouvoir utiliser un
LLM. Nous avons choisi d'utiliser les modèles Kimi de #link("https://www.moonshot.ai/")[Moonshot AI],
qui sont très performants et offrent un bon rapport qualité-prix. Pour obtenir une clé
d'API Kimi il faut suivre les instructions à https://platform.kimi.ai/console/api-keys.

Pour l'accès au modèle, il est aussi possible d'utiliser #link("https://github.com/features/copilot")[GitHub Copilot].
En l'occurence, les étudiants de la HEIG-VD ont accès à Copilot gratuitement, ce qui
en fait une option intéressante même si avec #link("https://github.blog/news-insights/company-news/github-copilot-is-moving-to-usage-based-billing/")
[les changements de tarification récents de GitHub Copilot], l'option a perdu de son attrait.

Ensuite, pour installer notre plugin d'optimisation de code, il suffit d'exécuter
la commands suivante dans le terminal:
#todo("Put actual repo link here")
```bash
pi install git:github.com/user/repo
```

= Fonctionnement

#minipage(
  columns: (0.8fr, 1fr),
  inset: 0.5cm,
  [
    #image("./assets/concept.png")
  ],
  [
    L'agent principal sert à orchestrer les interactions entre les différents sous-agents
    et à s'assurer que la pipeline reste cohérente.

    Chaque sous-agent a une tâche spécifique et n'a accès qu'aux informations nécessaires
    à sa tâche. Lorsqu'un sous-agent termine sa tâche, l'agent principal reçoit les
    résultats et décide de la suite à donner.
  ],
)

Cette chaine d'optimisation permet de traiter un aspect à la fois, en se concentrant
sur une optimisation spécifique à chaque itération. L'agent principal a une liste
de tous les types d'optimisation et les parcourt une par une. Il y a un choix à faire
si une optimisation est jugée pertinente ou non. Si elle est jugée pertinente, l'agent
principal demande à l'agent de performance de benchmarker le code avant l'optimisation,
puis demande à l'agent d'optimisation de proposer des améliorations et de les appliquer
au code. Ensuite, il demande à l'agent de performance de benchmarker le code après
l'optimisation et compare les résultats. Si les résultats sont satisfaisants, il
commit les changements sur la branche courante avec un message décrivant l'itération
et le type d'optimisation, les performances avant et après, et les fichiers changés.
Si les résultats ne sont insatisfaisants, il annule les changements et passe à l'optimisation
suivante.

= Résultats

= Conclusion


