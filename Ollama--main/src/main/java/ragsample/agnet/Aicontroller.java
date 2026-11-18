package ragsample.agnet;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.web.bind.annotation.*;


@RestController
@RequestMapping("/ai")
public class Aicontroller {

    private final ChatClient chatClient;

    public Aicontroller(ChatClient.Builder builder) {

        this.chatClient = builder.build();
    }

    @GetMapping("/ask")
    public String askGet(@RequestParam String question) {

        return chatClient
                .prompt()
                .user(question)
                .call()
                .content();
    }

    // POST method
    @PostMapping("/ask")
    public String askPost(@RequestBody String question) {

        return chatClient
                .prompt()
                .user(question)
                .call()
                .content();
    }
}
