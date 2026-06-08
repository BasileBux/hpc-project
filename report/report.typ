// Report template function
#let report(
  title: "Report Title",
  course: "Course Name",
  subject: "Subject Name",
  teacher: "Teacher Name",
  students: (),
  university: "HEIG-VD",
  logo: none,
  logo-offset: 0cm,
  show-toc: true,
  date: datetime.today(),
  body,
) = {
  set page(
    paper: "a4",
    margin: (left: 2.5cm, right: 2.5cm, top: 3cm, bottom: 2cm),
    header: context {
      if counter(page).get().first() > 1 [
        #set text(10pt)
        #grid(
          columns: (1fr, 1fr),
          align: (left, right),
          [#if type(students) == array { students.join(", ") } else {
            students
          }],
          [#date.display("[day].[month].[year]")],
        )
        #line(length: 100%, stroke: 0.5pt)
      ]
    },
    footer: context {
      if counter(page).get().first() > 1 [
        #set text(10pt)
        #grid(
          columns: (1fr, 1fr, 1fr),
          align: (left, center, right),
          [#course], [#title], counter(page).display("1"),
        )
      ]
    },
  )

  set text(
    font: "New Computer Modern",
    size: 12pt,
    lang: "en",
  )

  set par(
    justify: true,
    leading: 0.65em,
  )

  page(
    header: none,
    footer: none,
  )[

    #align(center)[
      #v(1cm)
      #if logo != none {
        move(dx: logo-offset, image(logo, width: 40%))
      }
      #v(2.5cm)

      #text(size: 14pt)[
        #smallcaps(course) \
        #if subject != "" {
          smallcaps(subject)
          linebreak()
        }
        #smallcaps(university)
      ]

      #v(1cm)

      #line(length: 100%, stroke: 0.2mm)
      #v(0.4cm)
      #text(size: 24pt, weight: "bold")[#title]
      #v(0.4cm)
      #line(length: 100%, stroke: 0.2mm)

      #v(2cm)

      #grid(
        columns: (1fr, 1fr),
        gutter: 2cm,
        align: (left, right),
        [
          #text(weight: "bold")[Students:] \
          #if type(students) == array { students.join("\n") } else { students }
        ],
        [
          #text(weight: "bold")[Teacher:] \
          #if type(teacher) == array { teacher.join("\n") } else { teacher }
        ],
      )

      #v(1fr)

      #text(size: 12pt)[#date.display("[day].[month].[year]")]
    ]
  ]

  if show-toc [
    #page[
      #outline(
        title: "Table of Contents",
        indent: auto,
      )
    ]
  ]

  body
}

#import "@preview/showybox:2.0.4": showybox
// Utility functions
#let box-radius = 3pt
#let box-title-style = (
  color: black,
  weight: "bold",
  align: start,
)
#let question(title, body) = showybox(
  title: "Question " + title,
  frame: (
    border-color: color.rgb("#9999FF"), // Renders to #8A8AE5
    title-color: color.rgb("#9999FF"), // Renders to #8A8AE5
    body-color: color.rgb("#D9D9FF"), // Renders to #C3C3E5
    radius: box-radius,
  ),
  title-style: box-title-style,
  body,
)
#let todo(body) = showybox(
   title: "TODO:",
  frame: (
    border-color: color.rgb("#FF9999"), // Renders to #E58A8A
    title-color: color.rgb("#FF9999"), // Renders to #E58A8A
    body-color: color.rgb("#FFD9D9"), // Renders to #E5C3C3
    radius: box-radius,
  ),
  title-style: box-title-style,
  body
)

#let warning(body) = showybox(
  title: "WARNING:",
  frame: (
    border-color: color.rgb("#FFFA99"), // Renders to #E5E18A
    title-color: color.rgb("#FFFA99"), // Renders to #E5E18A
    body-color: color.rgb("#FFFFD9"), // Renders to #E5E5C3
    radius: box-radius,
  ),
  title-style: box-title-style,
  body
)

// Split space into Vertical columns
#let minipage(
  columns: none,
  align: left,
  inset: 0pt,
  ..blocks
) = {
  let n = blocks.pos().len()
  let cols = if columns == none {
    (1fr,) * n
  } else {
    columns
  }
  table(
    columns: cols,
    align: align,
    stroke: none,
    inset: inset,
    ..blocks.pos()
  )
}
