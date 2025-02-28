const puppeteer = require("puppeteer");
const axios = require("axios");
require("dotenv").config();

const timeout = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  await page.goto("https://www.linkedin.com/login");
  await page.type("#username", process.env.LINKEDIN_EMAIL);
  await page.type("#password", process.env.LINKEDIN_PASSWORD);
  await page.click('[type="submit"]');
  await page.waitForNavigation();

  await page.goto("https://www.linkedin.com/feed/");
  await page.waitForSelector(".feed-shared-update-v2");

  const posts = await page.evaluate(() => {
    const postElements = document.querySelectorAll(".feed-shared-update-v2");
    return Array.from(postElements)
      .map((post) => {
        const text =
          post.querySelector(".update-components-text")?.innerText || "";
        return text;
      })
      .filter((text) => text.length > 0);
  });

  async function generateComment(postText) {
    const response = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "Crie um comentário curto de no máximo 100 carácteres, genérico e positivo sobre o seguinte texto de um post do LinkedIn, o comentário não deve adicionar hashtags. Não esboce nenhuma opinião política nem sobre gêneros, raças ou religiões.",
          },
          { role: "user", content: postText },
        ],
        max_tokens: 50,
        temperature: 0.7,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPEN_AI_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );
    return response.data.choices[0].message.content.trim();
  }

  for (
    let i = 0;
    i < Math.min(posts.length, process.env.POSTS_TO_COMMENT);
    i++
  ) {
    const postText = posts[i];
    const comment = await generateComment(postText);

    await page.evaluate(
      (idx, commentText) => {
        const post = document.querySelectorAll(".feed-shared-update-v2")[idx];
        const commentButton = post.querySelector(".comment-button"); // certo
        if (commentButton) commentButton.click();
      },
      i,
      comment
    );

    await timeout(1000);

    await page.evaluate(
      async (idx, commentText) => {
        const timeout = (ms) =>
          new Promise((resolve) => setTimeout(resolve, ms));

        const qlContainer = document.querySelectorAll(
          ".comments-comment-texteditor"
        )[idx];
        const textArea = qlContainer.querySelector(".ql-editor");

        if (textArea) textArea.children[0].innerText = commentText;

        await timeout(4000);

        const submit = qlContainer.querySelector(
          ".comments-comment-box__submit-button--cr"
        );

        submit.click();
        console.log("Submitted comment", commentText);
      },
      i,
      comment
    );

    await timeout(10000);
  }

  await browser.close();
})();
