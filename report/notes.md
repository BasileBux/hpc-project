**Kimi-k2.6 prompt in pi agent harness to build the workflow:**
For a school exploratory project, I have to create a full AI workflow in the pi agent harness (we are currently in) to optimize C code.
I wrote README.md which describes in great detail the workflow and the steps to build it. I need you to implement it in the pi agent harness.
You will write the package in `.`. The ultimate goal is to use sub agents extensively to test if we can use "dumber" agents
to compete with "smarter" agents by using less context and focusing their attention on specific tasks. With this we expect to cut costs
but keep reasonable performance. To get the full context and details, please read the `./README.md` file. For the UI (visuals only so not logic),
I want it to be as transparent as possible. For each subagent, I want to have the prompt it was given at the top and the full response it is giving
while the agent is working so that it is super easy to understand what is going on. If we are in the coordinator agent, show the full subagent
call stack. At the end, I want to have a summary of the results for each optimization step and a small summary of what was done.

**Prompt to optimize without the optimization workflow:**

